"use client";

import { ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ProjectSelect, useProjects } from "@/components/shell";
import { AgentBadge, Button, Drawer, EmptyState, ErrorNote, Markdown, PageHeader, parseDbDate, StatusDot, Tabs, TierBadge, timeAgo } from "@/components/ui";
import { send, useLive } from "@/components/use-live";
import type { EventType, FileRecord, Run, RunLog, RunWithActivity, VaultItem } from "@/db/types";

const STALE_MS = 15 * 60 * 1000;

interface RunsResponse {
  runs: RunWithActivity[];
  stats: { active_runs: number; total_runs: number; knowledge: number; files: number; pending_commands: number };
}

function isQuiet(run: Run): boolean {
  return run.status === "active" && Date.now() - parseDbDate(run.updated_at).getTime() > STALE_MS;
}

const EVENT_COLOR: Record<EventType, string> = {
  heartbeat: "text-ink-3",
  milestone: "text-accent",
  insight: "text-note",
  result: "text-knowledge",
  error: "text-danger",
};

function RunCard({ run, onOpen }: { run: RunWithActivity; onOpen: () => void }) {
  const quiet = isQuiet(run);
  return (
    <button onClick={onOpen} className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-3.5 text-left hover:border-ink-3">
      <div className="flex w-full items-center gap-2">
        <AgentBadge name={run.agent_name} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{run.project_id}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
          <StatusDot status={quiet ? "idle" : run.status} />
          {quiet ? "quiet" : run.status}
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-medium">{run.title}</p>
      <p className="line-clamp-2 min-h-[2.5em] text-[13px] leading-[1.25rem] text-ink-2">{run.last_message ?? "No activity yet."}</p>
      <div className="flex w-full justify-between font-mono text-[11px] text-ink-3">
        <span>
          {run.heartbeat_count} heartbeat{run.heartbeat_count === 1 ? "" : "s"}
        </span>
        <span>{timeAgo(run.updated_at)}</span>
      </div>
    </button>
  );
}

function QuickCommand({ run }: { run: Run }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<{ sent?: boolean; error?: string }>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await send("/api/commands", "POST", { target_agent: run.agent_name, instruction: text, project_id: run.project_id });
      setText("");
      setState({ sent: true });
    } catch (error) {
      setState({ error: (error as Error).message });
    }
  };
  return (
    <form onSubmit={submit} className="border-t border-line px-4 py-3 md:px-5">
      <label htmlFor="quick-command" className="mb-1.5 block text-xs text-ink-2">
        Message {run.agent_name} on its next tool call
      </label>
      <div className="flex gap-2">
        <input
          id="quick-command"
          className="field"
          placeholder="Next time you run, prioritize..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setState({});
          }}
        />
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          <Send size={14} aria-hidden />
          Queue
        </Button>
      </div>
      {state.sent && <p className="mt-1.5 text-xs text-knowledge">Queued. Track it under Orbits.</p>}
      {state.error && <p className="mt-1.5 text-xs text-danger">{state.error}</p>}
    </form>
  );
}

type InspectorTab = "logs" | "insights" | "results";

function RunInspector({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data, error } = useLive<{ run: Run; logs: RunLog[]; vault_items: VaultItem[]; files: FileRecord[] }>(`/api/runs/${encodeURIComponent(runId)}`);
  const [tab, setTab] = useState<InspectorTab>("logs");
  const run = data?.run;

  return (
    <Drawer
      onClose={onClose}
      title={
        run ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <AgentBadge name={run.agent_name} />
              <span className="flex items-center gap-1.5 text-xs text-ink-2">
                <StatusDot status={run.status} />
                {run.status}
              </span>
              <span className="font-mono text-[11px] text-ink-3">{run.project_id}</span>
            </div>
            <h2 className="mt-1.5 text-base font-semibold">{run.title}</h2>
            <p className="mt-0.5 text-xs text-ink-3">
              Started {timeAgo(run.started_at)}, updated {timeAgo(run.updated_at)}
            </p>
          </div>
        ) : (
          <h2 className="text-base font-semibold">Run</h2>
        )
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && run && (
        <div className="-mx-4 -my-4 flex min-h-full flex-col md:-mx-5">
          <div className="px-4 pt-2 md:px-5">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { id: "logs", label: "Execution Logs", count: data.logs.length },
                { id: "insights", label: "AI Insights" },
                { id: "results", label: "Results", count: data.files.length + data.vault_items.length },
              ]}
            />
          </div>
          <div className="flex-1 px-4 py-4 md:px-5">
            {tab === "logs" && (
              <ol className="flex flex-col gap-3">
                {data.logs.map((log) => (
                  <li key={log.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-sm">
                    <div className="font-mono text-[11px] leading-5">
                      <div className={EVENT_COLOR[log.event_type]}>{log.event_type}</div>
                      <div className="text-ink-3">{parseDbDate(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <div className="min-w-0 break-words">
                      {log.message}
                      {log.metadata_json && <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2 font-mono text-[11px] text-ink-2">{log.metadata_json}</pre>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {tab === "insights" && (
              <div className="flex flex-col gap-5">
                <section>
                  <h3 className="mb-1.5 text-xs font-medium text-ink-2">Summary</h3>
                  {run.summary ? <Markdown>{run.summary}</Markdown> : <p className="text-sm text-ink-3">This agent hasn't logged a summary yet.</p>}
                </section>
                <section>
                  <h3 className="mb-1.5 text-xs font-medium text-ink-2">Insights and blockers</h3>
                  {run.ai_insights ? <Markdown>{run.ai_insights}</Markdown> : <p className="text-sm text-ink-3">This agent hasn't logged any insights yet.</p>}
                </section>
              </div>
            )}
            {tab === "results" && (
              <div className="flex flex-col gap-2">
                {data.files.map((file) => (
                  <Link key={file.id} href={`/files?id=${file.id}`} className="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{file.filename}</span>
                      {file.summary && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-2">{file.summary}</span>}
                    </span>
                    <ExternalLink size={14} className="shrink-0 text-ink-3" aria-hidden />
                  </Link>
                ))}
                {data.vault_items.map((item) => (
                  <Link key={item.id} href={`/vault?item=${item.id}`} className="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-sm hover:bg-surface-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <TierBadge tier={item.tier} />
                      <span className="truncate font-medium">{item.title}</span>
                    </span>
                    <ExternalLink size={14} className="shrink-0 text-ink-3" aria-hidden />
                  </Link>
                ))}
                {data.files.length + data.vault_items.length === 0 && <p className="text-sm text-ink-3">This run hasn't produced any files or vault items.</p>}
              </div>
            )}
          </div>
          <QuickCommand run={run} />
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-xl font-semibold tabular-nums">{value ?? "-"}</div>
      <div className="truncate text-xs text-ink-2">{label}</div>
    </div>
  );
}

export default function LiveDashboard() {
  const { project } = useProjects();
  const router = useRouter();
  const params = useSearchParams();
  const runId = params.get("run");
  const { data, error, loading } = useLive<RunsResponse>(`/api/runs${project ? `?project=${encodeURIComponent(project)}` : ""}`);
  const [, tick] = useState(0);

  // Keeps relative times and "quiet" labels current between database changes.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const runs = data?.runs ?? [];
  const stats = data?.stats;

  return (
    <>
      <PageHeader title="Live" description="Every agent session reporting to Orbit, updated as it happens." actions={<ProjectSelect />} />
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
        <Stat label="Active runs" value={stats?.active_runs} />
        <Stat label="Pending commands" value={stats?.pending_commands} />
        <Stat label="Knowledge items" value={stats?.knowledge} />
        <Stat label="Files" value={stats?.files} />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && runs.length === 0 && (
        <EmptyState title="No agent runs yet">
          Connect your AI tools with <code className="font-mono text-xs">npm run orbit -- init</code>, restart them, then start a chat. Sessions appear here on their first heartbeat.
        </EmptyState>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} onOpen={() => router.replace(`/?run=${run.id}`, { scroll: false })} />
        ))}
      </div>
      {runId && <RunInspector key={runId} runId={runId} onClose={() => router.replace("/", { scroll: false })} />}
    </>
  );
}
