import Database from "better-sqlite3";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { v4 as uuid } from "uuid";
import { buildActivationPrompt, buildLaunch } from "../lib/orbit-prompt";
import { dbPath, filesDir, orbitPromptsDir } from "../paths";
import { SCHEMA } from "./schema";
import type {
  Command,
  CommandWithDeliveries,
  EventType,
  FileRecord,
  Orbit,
  OrbitWithLaunch,
  Platform,
  Project,
  QueuedCommand,
  Run,
  RunLog,
  RunStatus,
  RunWithActivity,
  SearchHit,
  Tier,
  VaultItem,
} from "./types";

export * from "./types";

export const DEFAULT_PROJECT = "default";
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_INDEXED_BODY = 1_000_000;
const BROADCAST_WINDOW = "-1 day";
const MAX_DELIVERY_ATTEMPTS = 2;

// Stored on globalThis so Next.js hot reloads reuse one connection.
const store = globalThis as unknown as { __orbitDb?: { path: string; db: Database.Database } };

export function getDb(): Database.Database {
  const path = dbPath();
  if (store.__orbitDb?.path === path) return store.__orbitDb.db;
  store.__orbitDb?.db.close();

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  mkdirSync(filesDir(), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  // Several stdio servers, the HTTP server, and the dashboard share this file.
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  // Databases created before redelivery lack this column, and CREATE TABLE IF NOT EXISTS won't add it.
  const deliveryColumns = db.pragma("table_info(command_deliveries)") as { name: string }[];
  if (!deliveryColumns.some((c) => c.name === "attempts")) {
    db.exec("ALTER TABLE command_deliveries ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1");
  }
  db.prepare("INSERT OR IGNORE INTO projects (id, name, description) VALUES (?, ?, ?)").run(
    DEFAULT_PROJECT,
    "Default",
    "Catch-all project for work not tied to a specific project.",
  );
  store.__orbitDb = { path, db };
  return db;
}

export function closeDb(): void {
  store.__orbitDb?.db.close();
  store.__orbitDb = undefined;
}

// ---------------------------------------------------------------- projects

export function assertSlug(id: string): void {
  if (!SLUG.test(id)) {
    throw new Error(`Invalid project_id "${id}". Use lowercase letters, numbers, "-" and "_", starting with a letter or number.`);
  }
}

export function ensureProject(id: string, name?: string, description?: string): Project {
  assertSlug(id);
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO projects (id, name, description) VALUES (?, ?, ?)").run(
    id,
    name ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description ?? null,
  );
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
}

export function getProject(id: string): Project | undefined {
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
}

export function listProjects(): Project[] {
  return getDb().prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE, id").all() as Project[];
}

export function updateSynthesizedState(projectId: string, markdown: string): Project {
  ensureProject(projectId);
  getDb()
    .prepare("UPDATE projects SET synthesized_state = ?, updated_at = datetime('now') WHERE id = ?")
    .run(markdown, projectId);
  return getProject(projectId)!;
}

const KNOWLEDGE_HEADING = "## Verified Knowledge";

function summarize(markdown: string): string {
  const line =
    markdown
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#") && !l.startsWith("```")) ?? "";
  const clean = line.replace(/^[-*>]\s+/, "").replace(/\s+/g, " ");
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

/** Adds or refreshes one item's line under a managed heading, leaving the rest of the document untouched. */
export function mergeKnowledgeIntoState(state: string | null, item: Pick<VaultItem, "id" | "title" | "content">): string {
  const marker = `<!-- vault:${item.id} -->`;
  const summary = summarize(item.content);
  const title = item.title.replace(/\s+/g, " ").trim();
  const entry = `- **${title}**${summary ? `: ${summary}` : ""} ${marker}`;
  const lines = (state ?? "").split("\n");

  const existing = lines.findIndex((l) => l.includes(marker));
  if (existing >= 0) {
    lines[existing] = entry;
    return lines.join("\n");
  }

  const heading = lines.findIndex((l) => l.trim() === KNOWLEDGE_HEADING);
  if (heading < 0) {
    const body = (state ?? "").trimEnd();
    return `${body ? `${body}\n\n` : ""}${KNOWLEDGE_HEADING}\n\n${entry}\n`;
  }
  let end = lines.findIndex((l, i) => i > heading && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  while (end > heading + 1 && lines[end - 1]!.trim() === "") end--;
  lines.splice(end, 0, entry);
  return lines.join("\n");
}

// -------------------------------------------------------------------- runs

export interface HeartbeatInput {
  run_id?: string;
  project_id: string;
  agent_name: string;
  title: string;
  event_type: EventType;
  message: string;
  status?: RunStatus;
  summary?: string;
  ai_insights?: string;
  metadata?: unknown;
  orbit_id?: string;
}

export function recordHeartbeat(input: HeartbeatInput): Run {
  const db = getDb();
  return db
    .transaction((): Run => {
      ensureProject(input.project_id);
      const status: RunStatus | undefined = input.status ?? (input.event_type === "error" ? "error" : undefined);
      let id = input.run_id;
      if (id) {
        const updated = db
          .prepare(
            `UPDATE runs SET title = ?, status = COALESCE(?, status), summary = COALESCE(?, summary),
             ai_insights = COALESCE(?, ai_insights), updated_at = datetime('now') WHERE id = ?`,
          )
          .run(input.title, status ?? null, input.summary ?? null, input.ai_insights ?? null, id);
        if (updated.changes === 0) {
          throw new Error(`Unknown run_id "${id}". Omit run_id to start a new run.`);
        }
      } else {
        id = uuid();
        db.prepare(
          `INSERT INTO runs (id, project_id, agent_name, title, status, summary, ai_insights)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, input.project_id, input.agent_name, input.title, status ?? "active", input.summary ?? null, input.ai_insights ?? null);
      }
      db.prepare("INSERT INTO run_logs (run_id, event_type, message, metadata_json) VALUES (?, ?, ?, ?)").run(
        id,
        input.event_type,
        input.message,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      );
      if (input.orbit_id) {
        db.prepare("UPDATE orbits SET last_run_at = datetime('now') WHERE id = ?").run(input.orbit_id);
      }
      return db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run;
    })
    .immediate();
}

export function getRun(id: string): Run | undefined {
  return getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run | undefined;
}

const RUN_ACTIVITY = `SELECT r.*,
  (SELECT COUNT(*) FROM run_logs l WHERE l.run_id = r.id AND l.event_type = 'heartbeat') AS heartbeat_count,
  (SELECT l.message FROM run_logs l WHERE l.run_id = r.id ORDER BY l.id DESC LIMIT 1) AS last_message
  FROM runs r`;

export function listRuns(opts: { projectId?: string; limit?: number } = {}): RunWithActivity[] {
  const where = opts.projectId ? "WHERE r.project_id = @projectId" : "";
  return getDb()
    .prepare(
      `${RUN_ACTIVITY} ${where}
       ORDER BY CASE r.status WHEN 'active' THEN 0 ELSE 1 END, r.updated_at DESC, r.rowid DESC LIMIT @limit`,
    )
    .all({ projectId: opts.projectId ?? null, limit: opts.limit ?? 50 }) as RunWithActivity[];
}

export function activeRunsFromOthers(projectId: string, agentName: string, limit = 10): RunWithActivity[] {
  return getDb()
    .prepare(
      `${RUN_ACTIVITY}
       WHERE r.project_id = ? AND r.agent_name != ? AND r.status = 'active'
         AND r.updated_at >= datetime('now', '-1 day')
       ORDER BY r.updated_at DESC LIMIT ?`,
    )
    .all(projectId, agentName, limit) as RunWithActivity[];
}

export function getRunDetail(id: string) {
  const run = getRun(id);
  if (!run) return undefined;
  const db = getDb();
  return {
    run,
    logs: db.prepare("SELECT * FROM run_logs WHERE run_id = ? ORDER BY id").all(id) as RunLog[],
    vault_items: db
      .prepare("SELECT * FROM vault_items WHERE source_run_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(id) as VaultItem[],
    files: db.prepare("SELECT * FROM files WHERE source_run_id = ? ORDER BY created_at DESC, rowid DESC").all(id) as FileRecord[],
  };
}

// ------------------------------------------------------------------- vault

export interface SaveVaultInput {
  project_id: string;
  run_id?: string;
  tier: Tier;
  title: string;
  content: string;
  tags?: string[];
}

export function saveVaultItem(input: SaveVaultInput): VaultItem {
  const db = getDb();
  return db
    .transaction((): VaultItem => {
      const project = ensureProject(input.project_id);
      const id = uuid();
      const tags = input.tags?.map((t) => t.trim()).filter(Boolean).join(",") || null;
      db.prepare(
        `INSERT INTO vault_items (id, project_id, source_run_id, tier, title, content, tags, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, input.project_id, input.run_id ?? null, input.tier, input.title, input.content, tags, input.tier === "knowledge" ? 1 : 0);
      const item = db.prepare("SELECT * FROM vault_items WHERE id = ?").get(id) as VaultItem;
      if (item.tier === "knowledge") {
        updateSynthesizedState(input.project_id, mergeKnowledgeIntoState(project.synthesized_state, item));
      }
      return item;
    })
    .immediate();
}

export function promoteVaultItem(id: string): VaultItem {
  const db = getDb();
  return db
    .transaction((): VaultItem => {
      const before = db.prepare("SELECT * FROM vault_items WHERE id = ?").get(id) as VaultItem | undefined;
      if (!before) throw new Error(`Unknown vault item "${id}".`);
      db.prepare("UPDATE vault_items SET tier = 'knowledge', is_verified = 1, updated_at = datetime('now') WHERE id = ?").run(id);
      const project = getProject(before.project_id)!;
      updateSynthesizedState(before.project_id, mergeKnowledgeIntoState(project.synthesized_state, before));
      return db.prepare("SELECT * FROM vault_items WHERE id = ?").get(id) as VaultItem;
    })
    .immediate();
}

export function listVaultItems(opts: { projectId?: string; tier?: Tier; limit?: number } = {}): VaultItem[] {
  return getDb()
    .prepare(
      `SELECT * FROM vault_items
       WHERE (@projectId IS NULL OR project_id = @projectId) AND (@tier IS NULL OR tier = @tier)
       ORDER BY updated_at DESC, rowid DESC LIMIT @limit`,
    )
    .all({ projectId: opts.projectId ?? null, tier: opts.tier ?? null, limit: opts.limit ?? 100 }) as VaultItem[];
}

export function getVaultItem(id: string): VaultItem | undefined {
  return getDb().prepare("SELECT * FROM vault_items WHERE id = ?").get(id) as VaultItem | undefined;
}

// ------------------------------------------------------------------- files

const MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
  ".html": "text/html",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".js": "text/javascript",
  ".ts": "text/plain",
  ".py": "text/plain",
  ".svg": "image/svg+xml",
};

export function safeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const clean = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(-120);
  return clean || "file.md";
}

export interface SaveFileInput {
  project_id: string;
  run_id?: string;
  filename: string;
  content: string;
  summary?: string;
}

export function saveFile(input: SaveFileInput): FileRecord & { absolute_path: string } {
  ensureProject(input.project_id);
  const filename = safeFilename(input.filename);
  mkdirSync(join(filesDir(), input.project_id), { recursive: true, mode: 0o700 });
  const timestamp = Date.now();
  let stored = join(input.project_id, `${timestamp}_${filename}`);
  // Two agents can save the same filename in the same millisecond, so never overwrite.
  for (let attempt = 1; ; attempt++) {
    try {
      writeFileSync(join(filesDir(), stored), input.content, { flag: "wx", mode: 0o600 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 100) throw error;
      stored = join(input.project_id, `${timestamp}-${attempt}_${filename}`);
    }
  }
  const absolute = join(filesDir(), stored);

  const db = getDb();
  const id = uuid();
  const mime = MIME[extname(filename).toLowerCase()] ?? "text/plain";
  db.transaction(() => {
    db.prepare(
      `INSERT INTO files (id, project_id, source_run_id, filename, file_path, mime_type, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.project_id, input.run_id ?? null, filename, stored, mime, input.summary ?? null);
    db.prepare("INSERT INTO fts_files (file_id, filename, summary, body) VALUES (?, ?, ?, ?)").run(
      id,
      filename,
      input.summary ?? "",
      input.content.slice(0, MAX_INDEXED_BODY),
    );
  }).immediate();
  return { ...getFile(id)!, absolute_path: absolute };
}

export function listFiles(opts: { projectId?: string; limit?: number } = {}): FileRecord[] {
  return getDb()
    .prepare(
      `SELECT * FROM files WHERE (@projectId IS NULL OR project_id = @projectId)
       ORDER BY created_at DESC, rowid DESC LIMIT @limit`,
    )
    .all({ projectId: opts.projectId ?? null, limit: opts.limit ?? 200 }) as FileRecord[];
}

export function getFile(id: string): FileRecord | undefined {
  return getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRecord | undefined;
}

export function resolveStoredFile(file: Pick<FileRecord, "file_path">): string {
  const root = resolve(filesDir());
  const absolute = resolve(root, file.file_path);
  if (!absolute.startsWith(root + sep)) throw new Error("File path is outside the files directory.");
  return absolute;
}

export function readStoredFile(file: Pick<FileRecord, "file_path">): Buffer {
  return readFileSync(resolveStoredFile(file));
}

// ------------------------------------------------------------------ search

/** Turns free text into an FTS5 prefix query. Tokens are alphanumeric, so FTS operators in user input cannot apply. */
export function toFtsQuery(query: string, operator: "AND" | "OR" = "AND"): string {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens.map((t) => `"${t}"*`).join(` ${operator} `);
}

type ScoredHit = Omit<SearchHit, "match"> & { score: number };

function runSearch(match: string, projectId: string | null, tier: Tier | null, limit: number): ScoredHit[] {
  const db = getDb();
  const vault = db
    .prepare(
      `SELECT v.id, v.project_id, v.tier, v.title, v.source_run_id, v.is_verified, v.updated_at,
              snippet(fts_vault_items, 2, '**', '**', '...', 28) AS snippet,
              bm25(fts_vault_items, 0, 8, 1, 4) AS score
       FROM fts_vault_items JOIN vault_items v ON v.id = fts_vault_items.item_id
       WHERE fts_vault_items MATCH @match
         AND (@projectId IS NULL OR v.project_id = @projectId)
         AND (@tier IS NULL OR v.tier = @tier)
       ORDER BY v.tier = 'knowledge' DESC, score LIMIT @limit`,
    )
    .all({ match, projectId, tier, limit }) as Array<Omit<ScoredHit, "kind" | "is_verified"> & { is_verified: number }>;

  // Files have no tier, so a tier-specific search covers the vault only.
  const files = tier
    ? []
    : (db
        .prepare(
          `SELECT f.id, f.project_id, f.filename AS title, f.source_run_id, f.created_at AS updated_at,
                  snippet(fts_files, 3, '**', '**', '...', 28) AS snippet,
                  bm25(fts_files, 0, 8, 4, 1) AS score
           FROM fts_files JOIN files f ON f.id = fts_files.file_id
           WHERE fts_files MATCH @match AND (@projectId IS NULL OR f.project_id = @projectId)
           ORDER BY score LIMIT @limit`,
        )
        .all({ match, projectId, limit }) as Array<{
        id: string;
        project_id: string;
        title: string;
        source_run_id: string | null;
        updated_at: string;
        snippet: string;
        score: number;
      }>);

  return [
    ...vault.map((v) => ({ ...v, kind: "vault" as const, is_verified: v.is_verified === 1 })),
    ...files.map((f) => ({ ...f, kind: "file" as const, tier: null, is_verified: false })),
  ];
}

/**
 * Prefers items containing every word. Agents often search with lists of related
 * words, so when that leaves room, items containing any of the words fill the rest.
 * Knowledge always sorts first, then full matches, then relevance.
 */
export function searchMemory(opts: { query: string; projectId?: string; tier?: Tier | "all"; limit?: number }): SearchHit[] {
  const every = toFtsQuery(opts.query, "AND");
  if (!every) return [];
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const tier = opts.tier && opts.tier !== "all" ? opts.tier : null;
  const projectId = opts.projectId ?? null;

  const full = runSearch(every, projectId, tier, limit).map((hit) => ({ ...hit, match: "all" as const }));
  const any = toFtsQuery(opts.query, "OR");
  const seen = new Set(full.map((hit) => `${hit.kind}:${hit.id}`));
  const partial =
    any !== every && full.length < limit
      ? runSearch(any, projectId, tier, limit)
          .filter((hit) => !seen.has(`${hit.kind}:${hit.id}`))
          .map((hit) => ({ ...hit, match: "partial" as const }))
      : [];

  return [...full, ...partial]
    .sort(
      (a, b) =>
        Number(b.tier === "knowledge") - Number(a.tier === "knowledge") ||
        Number(b.match === "all") - Number(a.match === "all") ||
        a.score - b.score,
    )
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
}

// ---------------------------------------------------------------- commands

export function enqueueCommand(input: { target_agent: string; instruction: string; project_id?: string | null }): Command {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO command_queue (project_id, target_agent, instruction) VALUES (?, ?, ?)")
    .run(input.project_id ?? null, input.target_agent, input.instruction);
  return db.prepare("SELECT * FROM command_queue WHERE id = ?").get(lastInsertRowid) as Command;
}

/**
 * Claims the commands an agent should receive now. Targeted commands go to their target.
 * Broadcasts reach each agent, and stay open for a day after first delivery so agents
 * that check in later still get them.
 *
 * Handing over a result doesn't prove the agent saw it: a client can run a tool and then
 * discard the result on a permission check. So an unacknowledged command is sent one more
 * time on the agent's next call, labelled as a repeat.
 */
export function drainCommands(agentName: string, projectId?: string | null): QueuedCommand[] {
  const db = getDb();
  return db
    .transaction((): QueuedCommand[] => {
      const commands = db
        .prepare(
          `SELECT c.*, d.attempts AS attempts FROM command_queue c
           LEFT JOIN command_deliveries d ON d.command_id = c.id AND d.agent_name = @agent
           WHERE (c.project_id IS NULL OR @project IS NULL OR c.project_id = @project)
             AND c.status != 'acknowledged'
             AND (
               d.attempts < ${MAX_DELIVERY_ATTEMPTS}
               OR (d.attempts IS NULL AND (
                 (c.status = 'pending' AND (
                   c.target_agent IN ('all', @agent)
                   OR c.target_agent IN (SELECT id FROM runs WHERE agent_name = @agent)))
                 OR (c.status = 'delivered' AND c.target_agent = 'all'
                   AND c.delivered_at >= datetime('now', '${BROADCAST_WINDOW}'))
               ))
             )
           ORDER BY c.id`,
        )
        .all({ agent: agentName, project: projectId ?? null }) as Array<Command & { attempts: number | null }>;
      const record = db.prepare(
        `INSERT INTO command_deliveries (command_id, agent_name) VALUES (?, ?)
         ON CONFLICT (command_id, agent_name) DO UPDATE SET attempts = attempts + 1`,
      );
      const mark = db.prepare(
        "UPDATE command_queue SET status = 'delivered', delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?",
      );
      return commands.map(({ attempts, ...command }) => {
        record.run(command.id, agentName);
        mark.run(command.id);
        return { ...command, status: "delivered" as const, repeat: attempts !== null };
      });
    })
    .immediate();
}

export function acknowledgeCommand(id: number): boolean {
  return (
    getDb()
      .prepare("UPDATE command_queue SET status = 'acknowledged', delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?")
      .run(id).changes > 0
  );
}

export function listCommands(limit = 50): CommandWithDeliveries[] {
  return getDb()
    .prepare(
      `SELECT c.*, (SELECT group_concat(d.agent_name, ', ') FROM command_deliveries d WHERE d.command_id = c.id) AS delivered_to
       FROM command_queue c ORDER BY c.id DESC LIMIT ?`,
    )
    .all(limit) as CommandWithDeliveries[];
}

export function deleteCommand(id: number): boolean {
  return getDb().prepare("DELETE FROM command_queue WHERE id = ? AND status = 'pending'").run(id).changes > 0;
}

export function listAgentNames(): string[] {
  return (getDb().prepare("SELECT DISTINCT agent_name FROM runs ORDER BY agent_name").all() as { agent_name: string }[]).map(
    (r) => r.agent_name,
  );
}

// ------------------------------------------------------------------ orbits

const CRON_FIELD = /^[\d*,/\-A-Za-z]+$/;

export function assertCron(schedule: string): void {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5 || !fields.every((f) => CRON_FIELD.test(f))) {
    throw new Error(`Invalid cron expression "${schedule}". Use five fields, for example "0 8 * * *".`);
  }
}

function withLaunch(orbit: Orbit): OrbitWithLaunch {
  const promptPath = join(orbitPromptsDir(), `${orbit.id}.md`);
  return { ...orbit, launch: buildLaunch(orbit.target_platform, promptPath, orbit.schedule_cron) };
}

export function createOrbit(input: {
  id?: string;
  name: string;
  project_id: string;
  goal_prompt: string;
  target_platform: Platform;
  schedule_cron?: string | null;
}): OrbitWithLaunch {
  ensureProject(input.project_id);
  const schedule = input.schedule_cron?.trim() || null;
  if (schedule) assertCron(schedule);
  const id = input.id ?? uuid();
  const prompt = buildActivationPrompt({
    id,
    name: input.name,
    projectId: input.project_id,
    goal: input.goal_prompt,
    platform: input.target_platform,
    schedule,
  });
  const db = getDb();
  db.prepare(
    `INSERT INTO orbits (id, name, project_id, goal_prompt, target_platform, schedule_cron, generated_activation_prompt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.project_id, input.goal_prompt, input.target_platform, schedule, prompt);

  // The prompt lives in a file because a multi-line string cannot go on a crontab line.
  mkdirSync(orbitPromptsDir(), { recursive: true, mode: 0o700 });
  writeFileSync(join(orbitPromptsDir(), `${id}.md`), prompt, { mode: 0o600 });
  return withLaunch(db.prepare("SELECT * FROM orbits WHERE id = ?").get(id) as Orbit);
}

export function listOrbits(): OrbitWithLaunch[] {
  return (getDb().prepare("SELECT * FROM orbits ORDER BY created_at DESC, rowid DESC").all() as Orbit[]).map(withLaunch);
}

// --------------------------------------------------------------- dashboard

/** Changes on any commit to the database, including commits from other processes. */
export function changeSignature(): string {
  const db = getDb();
  const version = db.pragma("data_version", { simple: true });
  const own = (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
  return `${version}:${own}`;
}

export function dashboardStats(projectId?: string) {
  const db = getDb();
  const count = (sql: string) =>
    (db.prepare(sql).get({ projectId: projectId ?? null }) as { n: number }).n;
  return {
    active_runs: count("SELECT COUNT(*) n FROM runs WHERE status = 'active' AND (@projectId IS NULL OR project_id = @projectId)"),
    total_runs: count("SELECT COUNT(*) n FROM runs WHERE (@projectId IS NULL OR project_id = @projectId)"),
    knowledge: count("SELECT COUNT(*) n FROM vault_items WHERE tier = 'knowledge' AND (@projectId IS NULL OR project_id = @projectId)"),
    files: count("SELECT COUNT(*) n FROM files WHERE (@projectId IS NULL OR project_id = @projectId)"),
    pending_commands: count("SELECT COUNT(*) n FROM command_queue WHERE status = 'pending' AND (@projectId IS NULL OR project_id IS NULL OR project_id = @projectId)"),
  };
}

export function removeProjectData(projectId: string): void {
  assertSlug(projectId);
  const db = getDb();
  const stored = db.prepare("SELECT id FROM files WHERE project_id = ?").all(projectId) as { id: string }[];
  const orbits = db.prepare("SELECT id FROM orbits WHERE project_id = ?").all(projectId) as { id: string }[];
  rmSync(join(filesDir(), projectId), { recursive: true, force: true });
  for (const o of orbits) rmSync(join(orbitPromptsDir(), `${o.id}.md`), { force: true });
  db.transaction(() => {
    db.prepare("DELETE FROM run_logs WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)").run(projectId);
    db.prepare("DELETE FROM runs WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM vault_items WHERE project_id = ?").run(projectId);
    for (const f of stored) db.prepare("DELETE FROM fts_files WHERE file_id = ?").run(f.id);
    db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM orbits WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM command_queue WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }).immediate();
}
