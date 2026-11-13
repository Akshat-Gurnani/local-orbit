"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProjectSelect, useProjects } from "@/components/shell";
import { EmptyState, ErrorNote, Markdown, PageHeader, timeAgo } from "@/components/ui";
import { useLive } from "@/components/use-live";
import type { Project, VaultItem } from "@/db/types";

function Source({ item }: { item: VaultItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
          <ShieldCheck size={14} className="shrink-0 text-knowledge" aria-hidden />
          <span className="truncate text-sm font-medium">{item.title}</span>
        </button>
        {item.source_run_id ? (
          <Link href={`/?run=${item.source_run_id}`} className="shrink-0 font-mono text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink">
            run {item.source_run_id.slice(0, 8)}
          </Link>
        ) : (
          <span className="shrink-0 font-mono text-[11px] text-ink-3">manual</span>
        )}
      </div>
      {open && (
        <div className="border-t border-line p-3.5">
          <Markdown>{item.content}</Markdown>
          <p className="mt-3 font-mono text-[11px] text-ink-3">Verified {timeAgo(item.updated_at)}</p>
        </div>
      )}
    </li>
  );
}

export default function StatePage() {
  const { project, projects, setProject } = useProjects();
  // State belongs to one project. With "All projects" selected, show the first one that has state.
  const selected = project || projects.find((p) => p.synthesized_state)?.id || projects[0]?.id || "";
  const { data, error, loading } = useLive<{ project: Project; knowledge: VaultItem[] }>(selected ? `/api/state?project=${encodeURIComponent(selected)}` : null);

  return (
    <>
      <PageHeader
        title="State"
        description="The current source of truth for this project, and the verified knowledge behind it."
        actions={<ProjectSelect allowAll={false} value={selected} onChange={setProject} />}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <>
          <section aria-label="Project state" className="mb-8 rounded-lg border border-line bg-surface p-5 md:p-6">
            {data.project.synthesized_state ? (
              <>
                <Markdown>{data.project.synthesized_state}</Markdown>
                <p className="mt-5 border-t border-line pt-3 font-mono text-[11px] text-ink-3">Updated {timeAgo(data.project.updated_at)}</p>
              </>
            ) : (
              <EmptyState title="No state yet">
                State builds up as knowledge is verified. Promote a report in the Vault, or have an agent call <code className="font-mono text-xs">orbit_update_state</code>.
              </EmptyState>
            )}
          </section>
          <h2 className="mb-1 text-sm font-semibold">Backing knowledge</h2>
          <p className="mb-3 text-[13px] text-ink-2">The verified items this state rests on, with the runs that produced them.</p>
          {data.knowledge.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {data.knowledge.map((item) => (
                <Source key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            !loading && <p className="text-sm text-ink-3">This project has no verified knowledge yet.</p>
          )}
        </>
      )}
    </>
  );
}
