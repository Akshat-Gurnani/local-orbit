"use client";

import { Download, FileCode2, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectSelect, useProjects } from "@/components/shell";
import { Button, CopyButton, Drawer, EmptyState, ErrorNote, Markdown, PageHeader, timeAgo } from "@/components/ui";
import { useLive } from "@/components/use-live";
import type { FileRecord } from "@/db/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FilePreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useLive<{ file: FileRecord; content: string; size: number; truncated: boolean }>(`/api/files/${encodeURIComponent(id)}`);
  const file = data?.file;
  const isMarkdown = file?.mime_type === "text/markdown";

  return (
    <Drawer
      onClose={onClose}
      title={
        <div>
          <h2 className="truncate text-base font-semibold">{file?.filename ?? "File"}</h2>
          {data && file && (
            <p className="mt-0.5 text-xs text-ink-3">
              {file.project_id}, {formatBytes(data.size)}, saved {timeAgo(file.created_at)}
              {file.source_run_id && (
                <>
                  {" · "}
                  <Link className="underline" href={`/?run=${file.source_run_id}`}>
                    View source run
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      }
      actions={
        data && file ? (
          <>
            <CopyButton text={data.content} />
            <a href={`/api/files/${file.id}/raw?download=1`} download={file.filename}>
              <Button tabIndex={-1}>
                <Download size={14} aria-hidden />
                Download
              </Button>
            </a>
            <a href={`/api/files/${file.id}/raw`} target="_blank" rel="noreferrer">
              <Button tabIndex={-1}>Raw</Button>
            </a>
          </>
        ) : undefined
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <>
          {data.truncated && <p className="mb-3 text-xs text-report">This preview shows the first 2 MB. Download the file to see all of it.</p>}
          {isMarkdown ? <Markdown>{data.content}</Markdown> : <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-5">{data.content}</pre>}
        </>
      )}
    </Drawer>
  );
}

export default function FilesPage() {
  const { project } = useProjects();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("id");
  const { data, error, loading } = useLive<{ files: FileRecord[] }>(`/api/files${project ? `?project=${encodeURIComponent(project)}` : ""}`);
  const files = data?.files ?? [];

  return (
    <>
      <PageHeader title="Files" description="Reports, research, and other deliverables saved by your agents." actions={<ProjectSelect />} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && files.length === 0 && (
        <EmptyState title="No files yet">
          Agents save finished work here with <code className="font-mono text-xs">orbit_save_file</code>.
        </EmptyState>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => {
          const Icon = file.mime_type === "text/markdown" ? FileText : FileCode2;
          return (
            <button
              key={file.id}
              onClick={() => router.replace(`/files?id=${file.id}`, { scroll: false })}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5 text-left hover:border-ink-3"
            >
              <span className="flex items-center gap-2">
                <Icon size={15} className="shrink-0 text-accent" aria-hidden />
                <span className="truncate text-sm font-medium">{file.filename}</span>
              </span>
              <span className="line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-2">{file.summary ?? "No summary."}</span>
              <span className="flex w-full justify-between gap-2 font-mono text-[11px] text-ink-3">
                <span className="truncate">{file.project_id}</span>
                <span className="shrink-0">{timeAgo(file.created_at)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {openId && <FilePreview key={openId} id={openId} onClose={() => router.replace("/files", { scroll: false })} />}
    </>
  );
}
