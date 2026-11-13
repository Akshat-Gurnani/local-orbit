export const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  synthesized_state TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  agent_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','completed','idle','error')),
  summary TEXT,
  ai_insights TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_runs_updated ON runs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_name);

CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('heartbeat','milestone','insight','result','error')),
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_run_logs_run ON run_logs(run_id, id);

CREATE TABLE IF NOT EXISTS vault_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_run_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('report','knowledge','note')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  is_verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vault_project_tier ON vault_items(project_id, tier, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_run ON vault_items(source_run_id);

-- vault_items has a TEXT primary key, so its implicit rowid can change on VACUUM.
-- The index therefore keys on item_id rather than using external-content rowids.
CREATE VIRTUAL TABLE IF NOT EXISTS fts_vault_items USING fts5(item_id UNINDEXED, title, content, tags);

CREATE TRIGGER IF NOT EXISTS vault_items_ai AFTER INSERT ON vault_items BEGIN
  INSERT INTO fts_vault_items(item_id, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS vault_items_au AFTER UPDATE OF title, content, tags ON vault_items BEGIN
  DELETE FROM fts_vault_items WHERE item_id = old.id;
  INSERT INTO fts_vault_items(item_id, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS vault_items_ad AFTER DELETE ON vault_items BEGIN
  DELETE FROM fts_vault_items WHERE item_id = old.id;
END;

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_run_id TEXT,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT DEFAULT 'text/markdown',
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_files_run ON files(source_run_id);

-- Holds file bodies as well as metadata so orbit_search_memory can match inside
-- deliverables. Written by saveFile() because triggers cannot see the body on disk.
CREATE VIRTUAL TABLE IF NOT EXISTS fts_files USING fts5(file_id UNINDEXED, filename, summary, body);

CREATE TABLE IF NOT EXISTS command_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  target_agent TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','delivered','acknowledged')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_commands_status ON command_queue(status, target_agent);

-- A single status column cannot describe a broadcast: target "all" would reach
-- only the first agent to call a tool. This records who has received what.
CREATE TABLE IF NOT EXISTS command_deliveries (
  command_id INTEGER NOT NULL REFERENCES command_queue(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (command_id, agent_name)
);

CREATE TABLE IF NOT EXISTS orbits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  goal_prompt TEXT NOT NULL,
  target_platform TEXT NOT NULL CHECK (target_platform IN ('claude','claude-code','codex','n8n')),
  schedule_cron TEXT,
  generated_activation_prompt TEXT NOT NULL,
  last_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
