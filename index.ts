import type { PluginContext } from "@getpaseo/plugin";
import { LinksPanel } from "./links.client";
import { LinkSchema, getLinks, gitInfo, putLinks, urlMetadata, type WorkspaceLink } from "./shared";
import { z } from "zod";

const StoreSchema = z.object({
  projects: z.record(z.string(), z.array(LinkSchema)),
});

type Store = z.infer<typeof StoreSchema>;

async function storeFile(): Promise<string> {
  const os = await import("node:os");
  const path = await import("node:path");
  const home = process.env.PASEO_HOME ?? path.join(os.homedir(), ".paseo");
  return path.join(home, "plugin-data", "workspace-links.json");
}

async function readStore(): Promise<Store> {
  const fs = await import("node:fs/promises");
  try {
    const raw = await fs.readFile(await storeFile(), "utf8");
    return StoreSchema.parse(JSON.parse(raw));
  } catch {
    return { projects: {} };
  }
}

async function writeStore(store: Store): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = await storeFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (error, stdout) => {
      resolve(error ? null : stdout.trim() || null);
    });
  });
}

function parseRemote(remote: string): { slug: string | null; webUrl: string | null } {
  const ssh = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (ssh) return { slug: ssh[2], webUrl: `https://${ssh[1]}/${ssh[2]}` };
  const https = remote.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (https) return { slug: https[2], webUrl: `https://${https[1]}/${https[2]}` };
  return { slug: null, webUrl: null };
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(\w+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function parseTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : null;
}

function parseIconHref(html: string): string | null {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  let fallback: string | null = null;
  for (const tag of links) {
    const rel = tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1]?.toLowerCase() ?? "";
    if (!/\bicon\b/.test(rel)) continue;
    const href = tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (!href) continue;
    if (rel.includes("apple-touch")) {
      fallback = fallback ?? href;
    } else {
      return href;
    }
  }
  return fallback;
}

async function fetchPage(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; PaseoWorkspaceLinks)" },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return null;
  }
}

export default function contribute(plugin: PluginContext) {
  plugin.handle(getLinks, async ({ projectId }) => {
    const store = await readStore();
    return { links: store.projects[projectId] ?? [] };
  });

  plugin.handle(putLinks, async ({ projectId, links }) => {
    const store = await readStore();
    if (links.length === 0) {
      delete store.projects[projectId];
    } else {
      store.projects[projectId] = links as WorkspaceLink[];
    }
    await writeStore(store);
    return { ok: true };
  });

  plugin.handle(gitInfo, async ({ directory }) => {
    const branch = await git(directory, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const remoteUrl = await git(directory, ["remote", "get-url", "origin"]);
    const parsed = remoteUrl ? parseRemote(remoteUrl) : { slug: null, webUrl: null };
    return { branch, remoteUrl, repoSlug: parsed.slug, repoWebUrl: parsed.webUrl };
  });

  plugin.handle(urlMetadata, async ({ url }) => {
    const response = await fetchPage(url);
    if (response == null || !response.ok) return { title: null, faviconUrl: null };
    const html = (await response.text()).slice(0, 512 * 1024);
    const title = parseTitle(html);
    const iconHref = parseIconHref(html);
    let faviconUrl: string | null = null;
    try {
      if (iconHref != null) {
        faviconUrl = new URL(iconHref, response.url).href;
      } else {
        const candidate = new URL("/favicon.ico", response.url).href;
        const probe = await fetchPage(candidate);
        if (probe?.ok) faviconUrl = candidate;
      }
    } catch {
      faviconUrl = null;
    }
    return { title, faviconUrl };
  });

  plugin.addWorkspacePanel({
    id: "links",
    title: "Links",
    icon: "Link",
    context: "workspace",
    Component: LinksPanel,
  });

  plugin.addCommandCenterItem({
    id: "open-links",
    title: "Open workspace links",
    icon: "Link",
    keywords: ["link", "url", "browser", "railway", "shortcut"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("links");
    },
  });

  return () => {};
}
