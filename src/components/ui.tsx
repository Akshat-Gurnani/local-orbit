"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RunStatus, Tier } from "@/db/types";

export function parseDbDate(value: string): Date {
  // SQLite CURRENT_TIMESTAMP is UTC but carries no zone marker.
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
}

export function timeAgo(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - parseDbDate(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return parseDbDate(value).toLocaleDateString();
}

/** Strips common Markdown syntax so card previews read as plain text. */
export function plainPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|>\s?|\d+\.\s+)/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      {/* skipHtml hides the vault markers in state documents. Raw HTML from agents never renders. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TIER_STYLE: Record<Tier, string> = {
  knowledge: "text-knowledge border-knowledge/40",
  report: "text-report border-report/40",
  note: "text-note border-note/40",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${TIER_STYLE[tier]}`}>{tier}</span>;
}

const STATUS_DOT: Record<RunStatus, string> = {
  active: "bg-knowledge pulse-dot",
  completed: "bg-ink-3",
  idle: "bg-report",
  error: "bg-danger",
};

export function StatusDot({ status }: { status: RunStatus }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />;
}

export function AgentBadge({ name }: { name: string }) {
  return <span className="truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{name}</span>;
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  const style =
    variant === "primary" ? "bg-accent text-accent-ink font-medium hover:opacity-90" : "border border-line text-ink hover:bg-surface-2";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${style} ${className}`}
    />
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <Button onClick={copy}>
      {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-lg text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function Drawer({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
    // Only run on open and close, even if the parent passes a new onClose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-40">
      <button aria-label="Close panel" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-line bg-surface outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
          <div className="min-w-0 flex-1">{title}</div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {actions && <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5 md:px-5">{actions}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${active === tab.id ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 font-mono text-xs text-ink-3">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
