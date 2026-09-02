import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const LinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  faviconUrl: z.string().nullable().optional(),
});

export type WorkspaceLink = z.infer<typeof LinkSchema>;

export const getLinks = defineRpc({
  name: "links.get",
  input: z.object({ projectId: z.string() }),
  output: z.object({ links: z.array(LinkSchema) }),
});

export const putLinks = defineRpc({
  name: "links.put",
  input: z.object({ projectId: z.string(), links: z.array(LinkSchema) }),
  output: z.object({ ok: z.boolean() }),
});

export const gitInfo = defineRpc({
  name: "git.info",
  input: z.object({ directory: z.string() }),
  output: z.object({
    branch: z.string().nullable(),
    remoteUrl: z.string().nullable(),
    repoSlug: z.string().nullable(),
    repoWebUrl: z.string().nullable(),
  }),
});

export const urlMetadata = defineRpc({
  name: "url.metadata",
  input: z.object({ url: z.string() }),
  output: z.object({
    title: z.string().nullable(),
    faviconUrl: z.string().nullable(),
  }),
});
