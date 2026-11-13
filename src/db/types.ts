// Row types only, with no runtime imports, so client components can use them.
export const TIERS = ["report", "knowledge", "note"] as const;
export type Tier = (typeof TIERS)[number];

export const RUN_STATUSES = ["active", "completed", "idle", "error"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const EVENT_TYPES = ["heartbeat", "milestone", "insight", "result", "error"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PLATFORMS = ["claude", "claude-code", "codex", "n8n"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type CommandStatus = "pending" | "delivered" | "acknowledged";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  synthesized_state: string | null;
  updated_at: string;
}

export interface Run {
  id: string;
  project_id: string;
  agent_name: string;
  title: string;
  status: RunStatus;
  summary: string | null;
  ai_insights: string | null;
  started_at: string;
  updated_at: string;
}

export interface RunWithActivity extends Run {
  heartbeat_count: number;
  last_message: string | null;
}

export interface RunLog {
  id: number;
  run_id: string;
  event_type: EventType;
  message: string;
  metadata_json: string | null;
  created_at: string;
}

export interface VaultItem {
  id: string;
  project_id: string;
  source_run_id: string | null;
  tier: Tier;
  title: string;
  content: string;
  tags: string | null;
  is_verified: number;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: string;
  project_id: string;
  source_run_id: string | null;
  filename: string;
  file_path: string;
  mime_type: string;
  summary: string | null;
  created_at: string;
}

export interface Command {
  id: number;
  project_id: string | null;
  target_agent: string;
  instruction: string;
  status: CommandStatus;
  created_at: string;
  delivered_at: string | null;
}

export interface QueuedCommand extends Command {
  /** True when this agent was already sent the command but hasn't acknowledged it. */
  repeat: boolean;
}

export interface CommandWithDeliveries extends Command {
  delivered_to: string | null;
}

export interface Orbit {
  id: string;
  name: string;
  project_id: string;
  goal_prompt: string;
  target_platform: Platform;
  schedule_cron: string | null;
  generated_activation_prompt: string;
  last_run_at: string | null;
  created_at: string;
}

export interface OrbitLaunch {
  prompt_path: string;
  command: string | null;
  cron_line: string | null;
  instructions: string;
}

export interface OrbitWithLaunch extends Orbit {
  launch: OrbitLaunch;
}

export interface SearchHit {
  kind: "vault" | "file";
  id: string;
  project_id: string;
  tier: Tier | null;
  title: string;
  snippet: string;
  source_run_id: string | null;
  is_verified: boolean;
  updated_at: string;
  /** "all" when the item contains every search word, "partial" when it contains only some. */
  match: "all" | "partial";
}
