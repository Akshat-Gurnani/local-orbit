"use client";

import { ArrowUpCircle, FileText, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ProjectSelect, useProjects } from "@/components/shell";
import { Button, Drawer, EmptyState, ErrorNote, Markdown, PageHeader, plainPreview, Tabs, TierBadge, timeAgo } from "@/components/ui";
import { send, useLive } from "@/components/use-live";
import type { SearchHit, Tier, VaultItem } from "@/db/types";

const TAB_COPY: Record<Tier, { label: string; hint: string; empty: string }> = {
  knowledge: {
    label: "Knowledge",
    hint: "Verified conclusions and decisions. Every agent treats these as canonical truth.",
    empty: "No verified knowledge yet. Promote a report once you've confirmed it.",
  },
  report: {
    label: "Reports",
    hint: "Raw outputs and brainstorming. Agents treat these as exploratory, not as truth.",
    empty: "No reports yet. Agents file their exploratory work here.",
  },
  note: {
    label: "Notes",
    hint: "General reference material and snippets.",
    empty: "No notes yet. Add the first one above.",
  },
};

function PromoteButton({ id, onError }: { id: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const promote = async () => {
    setBusy(true);
    try {
      await send(`/api/vault/${id}/promote`, "POST");
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button onClick={promote} disabled={busy}>
      <ArrowUpCircle size={14} aria-hidden />
      {busy ? "Promoting..." : "Promote to Knowledge"}
    </Button>
  );
}

function VaultCard({ item, onOpen, onError }: { item: VaultItem; onOpen: () => void; onError: (message: string) => void }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5">
      <button onClick={onOpen} className="flex flex-col gap-1.5 text-left">
        <span className="flex items-center gap-2">
          <TierBadge tier={item.tier} />
          {item.is_verified === 1 && <ShieldCheck size={14} className="text-knowledge" aria-label="Verified" />}
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{item.project_id}</span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3">{timeAgo(item.updated_at)}</span>
        </span>
        <span className="text-sm font-medium hover:underline">{item.title}</span>
        <span className="line-clamp-3 text-[13px] leading-5 text-ink-2">{plainPreview(item.content)}</span>
      </button>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="min-w-0 truncate font-mono text-[11px] text-ink-3">{item.tags?.split(",").map((t) => `#${t}`).join(" ")}</span>
        {item.tier === "report" && <PromoteButton id={item.id} onError={onError} />}
      </div>
    </article>
  );
}

function NoteEditor({ defaultProject }: { defaultProject: string }) {
  const { projects } = useProjects();
  const [project, setProject] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const target = project || defaultProject || "default";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await send("/api/vault", "POST", {
        project_id: target,
        title,
        content,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setTitle("");
      setContent("");
      setTags("");
      setPreview(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="Note title" className="field" placeholder="Note title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select aria-label="Note project" className="field sm:!w-48" value={target} onChange={(e) => setProject(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {preview ? (
        <div className="min-h-28 rounded-md border border-line p-3">{content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-ink-3">Nothing to preview yet.</p>}</div>
      ) : (
        <textarea aria-label="Note content in Markdown" className="field min-h-28 font-mono !text-[13px]" placeholder="Write in Markdown..." value={content} onChange={(e) => setContent(e.target.value)} />
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input aria-label="Tags" className="field" placeholder="Tags, separated by commas" value={tags} onChange={(e) => setTags(e.target.value)} />
        <div className="flex shrink-0 gap-2">
          <Button type="button" onClick={() => setPreview((p) => !p)}>
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !title.trim() || !content.trim()}>
            {saving ? "Saving..." : "Save note"}
          </Button>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}

function ItemDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: item, error } = useLive<VaultItem>(`/api/vault/${encodeURIComponent(id)}`);
  const [actionError, setActionError] = useState<string | null>(null);
  return (
    <Drawer
      onClose={onClose}
      title={
        <div>
          {item && <TierBadge tier={item.tier} />}
          <h2 className="mt-1.5 text-base font-semibold">{item?.title ?? "Vault item"}</h2>
          {item && (
            <p className="mt-0.5 text-xs text-ink-3">
              {item.project_id}, updated {timeAgo(item.updated_at)}
              {item.source_run_id && (
                <>
                  {" · "}
                  <Link className="underline" href={`/?run=${item.source_run_id}`}>
                    View source run
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      }
      actions={item?.tier === "report" ? <PromoteButton id={item.id} onError={setActionError} /> : undefined}
    >
      {(error || actionError) && <ErrorNote>{error ?? actionError}</ErrorNote>}
      {item && <Markdown>{item.content}</Markdown>}
    </Drawer>
  );
}

function SearchResults({ results, onOpen }: { results: SearchHit[]; onOpen: (hit: SearchHit) => void }) {
  if (results.length === 0) return <EmptyState title="No matches">Try fewer or different words.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {results.map((hit) => (
        <li key={`${hit.kind}-${hit.id}`}>
          <button onClick={() => onOpen(hit)} className="w-full rounded-lg border border-line bg-surface p-3.5 text-left hover:border-ink-3">
            <span className="flex items-center gap-2">
              {hit.tier ? (
                <TierBadge tier={hit.tier} />
              ) : (
                <span className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                  <FileText size={11} aria-hidden />
                  file
                </span>
              )}
              <span className="min-w-0 truncate text-sm font-medium">{hit.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{hit.project_id}</span>
            </span>
            <span className="mt-1.5 block text-[13px] leading-5 text-ink-2">
              {hit.snippet.split("**").map((part, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-accent/25 text-ink">{part}</mark> : part))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function VaultPage() {
  const { project } = useProjects();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("item");
  const [tab, setTab] = useState<Tier>("knowledge");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const scope = project ? `project=${encodeURIComponent(project)}` : "";
  const list = useLive<{ items: VaultItem[] }>(`/api/vault${scope ? `?${scope}` : ""}`);
  const search = useLive<{ results: SearchHit[] }>(debounced ? `/api/vault?q=${encodeURIComponent(debounced)}${scope ? `&${scope}` : ""}` : null);

  const byTier = useMemo(() => {
    const groups: Record<Tier, VaultItem[]> = { knowledge: [], report: [], note: [] };
    for (const item of list.data?.items ?? []) groups[item.tier].push(item);
    return groups;
  }, [list.data]);

  const open = (id: string) => router.replace(`/vault?item=${id}`, { scroll: false });

  return (
    <>
      <PageHeader title="Vault" description="Everything your agents have filed, separated by how much it can be trusted." actions={<ProjectSelect />} />
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input aria-label="Search memory" type="search" className="field !pl-9" placeholder="Search vault items and files..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {(list.error || search.error || actionError) && (
        <div className="mb-4">
          <ErrorNote>{list.error ?? search.error ?? actionError}</ErrorNote>
        </div>
      )}
      {debounced ? (
        search.data && (
          <SearchResults results={search.data.results} onOpen={(hit) => (hit.kind === "file" ? router.push(`/files?id=${hit.id}`) : open(hit.id))} />
        )
      ) : (
        <>
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={(Object.keys(TAB_COPY) as Tier[]).map((id) => ({ id, label: TAB_COPY[id].label, count: byTier[id].length }))}
          />
          <p className="mb-4 mt-3 text-[13px] text-ink-2">{TAB_COPY[tab].hint}</p>
          {tab === "note" && <NoteEditor defaultProject={project} />}
          {!list.loading && byTier[tab].length === 0 && <EmptyState title={TAB_COPY[tab].empty} />}
          <div className="grid gap-3 md:grid-cols-2">
            {byTier[tab].map((item) => (
              <VaultCard key={item.id} item={item} onOpen={() => open(item.id)} onError={setActionError} />
            ))}
          </div>
        </>
      )}
      {openId && <ItemDrawer key={openId} id={openId} onClose={() => router.replace("/vault", { scroll: false })} />}
    </>
  );
}
