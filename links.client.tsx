import {
  useRpc,
  useWorkspace,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin";
import { Icon, Modal, useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { getLinks, gitInfo, putLinks, urlMetadata, type WorkspaceLink } from "./shared";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTemplate(template: string, vars: Record<string, string | null>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value == null ? match : value;
  });
}

function isFetchableUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url) && !/\{\w+\}/.test(url);
}

export function LinksPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const workspace = useWorkspace(workspaceId, (w) => ({
    projectId: w.projectId,
    directory: w.directory,
    project: w.projectDisplayName,
    workspace: w.name,
  }));
  const callGetLinks = useRpc(getLinks);
  const callPutLinks = useRpc(putLinks);
  const callGitInfo = useRpc(gitInfo);
  const callUrlMetadata = useRpc(urlMetadata);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftFavicon, setDraftFavicon] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [faviconTouched, setFaviconTouched] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [brokenFavicons, setBrokenFavicons] = useState<Record<string, boolean>>({});
  const metaRequestRef = useRef(0);

  const projectId = workspace?.projectId ?? null;

  const linksQuery = useQuery({
    queryKey: ["workspace-links", projectId],
    queryFn: () => callGetLinks({ projectId: projectId! }),
    enabled: projectId != null,
  });
  const gitQuery = useQuery({
    queryKey: ["workspace-links-git", workspace?.directory],
    queryFn: () => callGitInfo({ directory: workspace!.directory }),
    enabled: workspace != null,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const links = linksQuery.data?.links ?? [];
  const vars = useMemo<Record<string, string | null>>(
    () => ({
      branch: gitQuery.data?.branch ?? null,
      repo: gitQuery.data?.repoSlug ?? null,
      repoUrl: gitQuery.data?.repoWebUrl ?? null,
      remote: gitQuery.data?.remoteUrl ?? null,
      dir: workspace?.directory ?? null,
      project: workspace?.project ?? null,
      workspace: workspace?.workspace ?? null,
    }),
    [gitQuery.data, workspace],
  );

  const save = useMutation({
    mutationFn: (next: WorkspaceLink[]) =>
      callPutLinks({ projectId: projectId!, links: next }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspace-links", projectId] }),
    onError: () => toast.error("Could not save links"),
  });

  // Auto-fill title/favicon from the resolved URL while the user hasn't typed their own.
  useEffect(() => {
    if (!editorOpen) return;
    const resolved = resolveTemplate(draftUrl.trim(), vars);
    if (!isFetchableUrl(resolved)) return;
    if (titleTouched && faviconTouched) return;
    const requestId = ++metaRequestRef.current;
    const timer = setTimeout(async () => {
      setFetchingMeta(true);
      try {
        const meta = await callUrlMetadata({ url: resolved });
        if (metaRequestRef.current !== requestId) return;
        if (!titleTouched && meta.title != null) setDraftTitle(meta.title);
        if (!faviconTouched && meta.faviconUrl != null) setDraftFavicon(meta.faviconUrl);
      } catch {
        // Metadata is best-effort; the user can fill the fields manually.
      } finally {
        if (metaRequestRef.current === requestId) setFetchingMeta(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [editorOpen, draftUrl, titleTouched, faviconTouched, vars, callUrlMetadata]);

  const styles = useMemo(() => {
    const pad = layout.compact ? 16 : 24;
    return {
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      content: { padding: pad, gap: 12 },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
      },
      heading: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 18 : 20,
        fontWeight: "600" as const,
      },
      addButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      addButtonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      favicon: { width: 20, height: 20, borderRadius: 4 },
      rowBody: { flex: 1, gap: 2 },
      rowTitle: { color: theme.colors.foreground, fontSize: 15, fontWeight: "500" as const },
      rowUrl: { color: theme.colors.foregroundMuted, fontSize: 12 },
      iconButton: { padding: 6 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 14 },
      hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
      input: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        fontSize: 14,
      },
      inputRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      inputFlex: { flex: 1 },
      label: { color: theme.colors.foregroundMuted, fontSize: 12, marginBottom: 4 },
      labelRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        marginBottom: 4,
      },
      modalBody: { gap: 12, padding: 4 },
      modalActions: {
        flexDirection: "row" as const,
        justifyContent: "flex-end" as const,
        gap: 8,
        marginTop: 4,
      },
      secondaryButton: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryButtonText: { color: theme.colors.foreground },
      primaryButton: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      primaryButtonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
    };
  }, [theme, layout.compact]);

  if (workspace == null) {
    return <View style={styles.screen} />;
  }

  function openEditor(link?: WorkspaceLink) {
    setEditingId(link?.id ?? null);
    setDraftTitle(link?.title ?? "");
    setDraftUrl(link?.url ?? "");
    setDraftFavicon(link?.faviconUrl ?? "");
    setTitleTouched(link != null && link.title.length > 0);
    setFaviconTouched(false);
    setFetchingMeta(false);
    metaRequestRef.current += 1;
    setEditorOpen(true);
  }

  function submitEditor() {
    const title = draftTitle.trim();
    const url = draftUrl.trim();
    const faviconUrl = draftFavicon.trim();
    if (title.length === 0 || url.length === 0) {
      toast.show("Both a title and a URL are required", { variant: "warning" });
      return;
    }
    const entry = { title, url, faviconUrl: faviconUrl.length > 0 ? faviconUrl : null };
    const next =
      editingId == null
        ? [...links, { id: newId(), ...entry }]
        : links.map((link) => (link.id === editingId ? { ...link, ...entry } : link));
    save.mutate(next);
    setEditorOpen(false);
  }

  function removeLink(id: string) {
    save.mutate(links.filter((link) => link.id !== id));
  }

  async function openLink(link: WorkspaceLink) {
    const url = resolveTemplate(link.url, vars);
    if (/\{\w+\}/.test(url)) {
      toast.show("Some {variables} in this URL have no value here", { variant: "warning" });
    }
    try {
      await Linking.openURL(url);
    } catch {
      toast.error(`Could not open ${url}`);
    }
  }

  function renderFavicon(link: WorkspaceLink) {
    const uri = link.faviconUrl ?? null;
    if (uri == null || brokenFavicons[link.id]) {
      return <Icon name="Link" size={18} color={theme.colors.foregroundMuted} />;
    }
    return (
      <Image
        source={{ uri }}
        style={styles.favicon}
        onError={() => setBrokenFavicons((prev) => ({ ...prev, [link.id]: true }))}
      />
    );
  }

  const varHint = Object.entries(vars)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `{${key}} → ${value}`)
    .join("\n");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Links</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add link"
          onPress={() => openEditor()}
          style={styles.addButton}
        >
          <Icon name="Plus" size={16} color={theme.colors.accentForeground} />
          <Text style={styles.addButtonText}>Add link</Text>
        </Pressable>
      </View>

      {links.length === 0 ? (
        <Text style={styles.empty}>
          No links yet for {workspace.project}. Add one — URLs can use variables like{" "}
          {"{branch}"} and {"{repo}"} that resolve per workspace.
        </Text>
      ) : (
        links.map((link) => (
          <View key={link.id} style={styles.row}>
            {renderFavicon(link)}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${link.title}`}
              onPress={() => openLink(link)}
              style={styles.rowBody}
            >
              <Text style={styles.rowTitle}>{link.title}</Text>
              <Text style={styles.rowUrl} numberOfLines={1}>
                {resolveTemplate(link.url, vars)}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${link.title}`}
              onPress={() => openEditor(link)}
              style={styles.iconButton}
            >
              <Icon name="Pencil" size={16} color={theme.colors.foregroundMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${link.title}`}
              onPress={() => removeLink(link.id)}
              style={styles.iconButton}
            >
              <Icon name="Trash2" size={16} color={theme.colors.statusDanger} />
            </Pressable>
          </View>
        ))
      )}

      {varHint.length > 0 ? <Text style={styles.hint}>{varHint}</Text> : null}

      <Modal
        title={editingId == null ? "Add link" : "Edit link"}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      >
        <Modal.Content>
          <View style={styles.modalBody}>
            <View>
              <Text style={styles.label}>URL</Text>
              <TextInput
                value={draftUrl}
                onChangeText={setDraftUrl}
                placeholder="https://railway.app/…?branch={branch}"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
            <View>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Title</Text>
                {fetchingMeta ? (
                  <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
                ) : null}
              </View>
              <TextInput
                value={draftTitle}
                onChangeText={(text) => {
                  setDraftTitle(text);
                  setTitleTouched(text.trim().length > 0);
                }}
                placeholder="Fetched from the page — edit as you like"
                placeholderTextColor={theme.colors.foregroundMuted}
                style={styles.input}
              />
            </View>
            <View>
              <Text style={styles.label}>Favicon URL</Text>
              <View style={styles.inputRow}>
                {draftFavicon.trim().length > 0 ? (
                  <Image source={{ uri: draftFavicon.trim() }} style={styles.favicon} />
                ) : (
                  <Icon name="Link" size={18} color={theme.colors.foregroundMuted} />
                )}
                <TextInput
                  value={draftFavicon}
                  onChangeText={(text) => {
                    setDraftFavicon(text);
                    setFaviconTouched(true);
                  }}
                  placeholder="Fetched from the page — or paste your own"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, styles.inputFlex]}
                />
              </View>
            </View>
            <Text style={styles.hint}>
              Variables: {"{branch} {repo} {repoUrl} {remote} {dir} {project} {workspace}"}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setEditorOpen(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save link"
                onPress={submitEditor}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </ScrollView>
  );
}
