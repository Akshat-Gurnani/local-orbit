"use client";

import { Check, ChevronRight, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useProjects } from "@/components/shell";
import { AgentBadge, Button, CopyButton, EmptyState, ErrorNote, PageHeader, timeAgo } from "@/components/ui";
import { send, useLive } from "@/components/use-live";
import { PLATFORMS, type CommandStatus, type CommandWithDeliveries, type OrbitWithLaunch, type Platform } from "@/db/types";
import { PLATFORM_LABEL } from "@/lib/orbit-prompt";

const STATUS_STYLE: Record<CommandStatus, string> = {
  pending: "text-report border-report/40",
  delivered: "text-note border-note/40",
  acknowledged: "text-knowledge border-knowledge/40",
};

function CommandRow({ command, onError }: { command: CommandWithDeliveries; onError: (message: string) => void }) {
  const act = (method: string) => send(`/api/commands/${command.id}`, method).catch((e) => onError((e as Error).message));
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-line p-3 last:border-b-0">
      <span className={`mt-0.5 rounded border px-1.5 py-0.5 font-mono text-[11px] ${STATUS_STYLE[command.status]}`}>{command.status}</span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="break-words text-sm">{command.instruction}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <AgentBadge name={command.target_agent} />
          {command.project_id && <span className="font-mono">{command.project_id}</span>}
          <span>queued {timeAgo(command.created_at)}</span>
          {command.delivered_to && <span>received by {command.delivered_to}</span>}
        </p>
      </div>
      {command.status === "pending" && (
        <button onClick={() => act("DELETE")} aria-label="Cancel command" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-danger">
          <Trash2 size={14} />
        </button>
      )}
      {command.status === "delivered" && (
        <button onClick={() => act("PATCH")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Check size={13} aria-hidden />
          Mark done
        </button>
      )}
    </li>
  );
}

function CommandBar() {
  const { project } = useProjects();
  const commands = useLive<{ commands: CommandWithDeliveries[] }>("/api/commands");
  const runs = useLive<{ agents: string[] }>("/api/runs");
  const [target, setTarget] = useState("all");
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await send("/api/commands", "POST", { target_agent: target, instruction, project_id: project || null });
      setInstruction("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const list = commands.data?.commands ?? [];
  const pending = list.filter((c) => c.status === "pending").length;

  return (
    <section aria-labelledby="commands-heading" className="mb-10">
      <h2 id="commands-heading" className="text-base font-semibold">
        Remote commands
      </h2>
      <p className="mb-3 mt-0.5 text-[13px] text-ink-2">
        Queue an instruction, and an agent receives it the next time it calls any Orbit tool.{" "}
        {project ? `Only agents working in ${project} will receive it.` : "It applies to agents in any project."}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row">
        <input
          aria-label="Target agent"
          list="agent-names"
          className="field sm:!w-44 font-mono !text-[13px]"
          placeholder="all"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <datalist id="agent-names">
          <option value="all" />
          {runs.data?.agents.map((agent) => <option key={agent} value={agent} />)}
        </datalist>
        <input aria-label="Instruction" className="field" placeholder="Next time you run, prioritize..." value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <Button type="submit" variant="primary" className="shrink-0" disabled={!instruction.trim() || !target.trim()}>
          <Send size={14} aria-hidden />
          Queue
        </Button>
      </form>
      {(error || commands.error) && (
        <div className="mt-2">
          <ErrorNote>{error ?? commands.error}</ErrorNote>
        </div>
      )}
      {list.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 font-mono text-[11px] text-ink-3">
            {pending} pending, {list.length - pending} delivered
          </p>
          <ul className="rounded-lg border border-line bg-surface">
            {list.map((command) => (
              <CommandRow key={command.id} command={command} onError={setError} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-5">{code}</pre>
    </div>
  );
}

function OrbitDetail({ orbit }: { orbit: OrbitWithLaunch }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-5 text-ink-2">{orbit.launch.instructions}</p>
      {orbit.launch.command && <CodeBlock label="Run it once" code={orbit.launch.command} />}
      {orbit.launch.cron_line && <CodeBlock label="Schedule it with cron" code={orbit.launch.cron_line} />}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-ink-2">Activation prompt</span>
          <CopyButton text={orbit.generated_activation_prompt} label="Copy prompt" />
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-xs leading-5">{orbit.generated_activation_prompt}</pre>
      </div>
    </div>
  );
}

function OrbitBuilder({ onCreated }: { onCreated: (orbit: OrbitWithLaunch) => void }) {
  const { project, projects } = useProjects();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [platform, setPlatform] = useState<Platform>("claude-code");
  const [schedule, setSchedule] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = projectId || project || "default";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const orbit = await send<OrbitWithLaunch>("/api/orbits", "POST", {
        name,
        project_id: target,
        goal_prompt: goal,
        target_platform: platform,
        schedule_cron: schedule.trim() || null,
      });
      setName("");
      setGoal("");
      setSchedule("");
      onCreated(orbit);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = "mb-1 block text-xs font-medium text-ink-2";
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor="orbit-name">
          Orbit name
        </label>
        <input id="orbit-name" className="field" placeholder="Morning AI News Digest" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="orbit-project">
          Project
        </label>
        <select id="orbit-project" className="field" value={target} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="orbit-platform">
          Target platform
        </label>
        <select id="orbit-platform" className="field" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="orbit-schedule">
          Schedule (optional cron)
        </label>
        <input id="orbit-schedule" className="field font-mono !text-[13px]" placeholder="0 8 * * *" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="orbit-goal">
          Goal, in plain English
        </label>
        <textarea id="orbit-goal" className="field min-h-24" placeholder="Compile a daily morning AI news digest with sources." value={goal} onChange={(e) => setGoal(e.target.value)} />
      </div>
      {error && (
        <div className="sm:col-span-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || !goal.trim()}>
          <Sparkles size={14} aria-hidden />
          {busy ? "Generating..." : "Generate Orbit Activation Prompt"}
        </Button>
      </div>
    </form>
  );
}

function OrbitList({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const { data, error } = useLive<{ orbits: OrbitWithLaunch[] }>("/api/orbits");
  const orbits = data?.orbits ?? [];
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (data && orbits.length === 0) return <EmptyState title="No Orbits yet">Describe a goal above to generate your first one.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {orbits.map((orbit) => {
        const open = openId === orbit.id;
        return (
          <li key={orbit.id} className="rounded-lg border border-line bg-surface">
            <button onClick={() => setOpenId(open ? null : orbit.id)} aria-expanded={open} className="flex w-full items-center gap-2.5 p-3.5 text-left">
              <ChevronRight size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{orbit.name}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-2">{orbit.goal_prompt}</span>
              </span>
              <span className="hidden shrink-0 text-right font-mono text-[11px] text-ink-3 sm:block">
                <span className="block">
                  {PLATFORM_LABEL[orbit.target_platform]}
                  {orbit.schedule_cron ? ` · ${orbit.schedule_cron}` : ""}
                </span>
                <span className="block">{orbit.last_run_at ? `last run ${timeAgo(orbit.last_run_at)}` : "not run yet"}</span>
              </span>
            </button>
            {open && (
              <div className="border-t border-line p-3.5">
                <OrbitDetail orbit={orbit} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function OrbitsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (created) document.getElementById("orbit-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [created]);

  return (
    <>
      <PageHeader title="Orbits" description="Send instructions to your agents, and turn plain-English goals into autonomous ones." />
      <CommandBar />
      <section aria-labelledby="builder-heading">
        <h2 id="builder-heading" className="text-base font-semibold">
          Build an Orbit
        </h2>
        <p className="mb-3 mt-0.5 text-[13px] text-ink-2">
          Generates a prompt that makes your chosen agent load Orbit context, do the work, and file the result in your Files repository.
        </p>
        <OrbitBuilder
          onCreated={(orbit) => {
            setOpenId(orbit.id);
            setCreated(orbit.id);
          }}
        />
        <div id="orbit-list" className="mt-4 scroll-mt-4">
          <OrbitList openId={openId} setOpenId={setOpenId} />
        </div>
      </section>
    </>
  );
}
