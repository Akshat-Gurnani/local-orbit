import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCK_END, BLOCK_START, WORKSPACE_FILES, workspaceBlock } from "./templates";

export const SERVER_KEY = "orbit";

export interface McpEntry {
  type?: "stdio";
  command: string;
  args: string[];
}

export interface ClientTarget {
  name: string;
  configPath: string;
  detected: boolean;
  typed: boolean;
}

export function clientTargets(home = homedir()): ClientTarget[] {
  const desktopDir =
    process.platform === "win32"
      ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude")
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Claude")
        : join(home, ".config", "Claude");
  return [
    { name: "Claude Desktop", configPath: join(desktopDir, "claude_desktop_config.json"), detected: existsSync(desktopDir), typed: false },
    { name: "Claude Code", configPath: join(home, ".claude.json"), detected: existsSync(join(home, ".claude.json")), typed: true },
    { name: "Cursor", configPath: join(home, ".cursor", "mcp.json"), detected: existsSync(join(home, ".cursor")), typed: false },
    {
      name: "Antigravity",
      configPath: join(home, ".gemini", "config", "mcp_config.json"),
      detected: existsSync(join(home, ".gemini", "config")),
      typed: false,
    },
    // Antigravity also creates ~/.gemini/settings.json, so the folder alone doesn't mean the Gemini CLI is installed.
    { name: "Gemini CLI", configPath: join(home, ".gemini", "settings.json"), detected: onPath("gemini"), typed: false },
  ];
}

function onPath(binary: string): boolean {
  return (process.env.PATH ?? "").split(delimiter).some((dir) => dir && existsSync(join(dir, binary)));
}

function findProjectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not locate the Local Orbit package root.");
    dir = parent;
  }
  return dir;
}

/**
 * Records the absolute Node binary and entry script. GUI apps have a different PATH,
 * and better-sqlite3 is native, so it must load under the Node that compiled it.
 */
export function stdioLaunch(root = findProjectRoot()): { command: string; args: string[] } {
  const built = join(root, "dist", "mcp", "server.js");
  if (existsSync(built)) return { command: process.execPath, args: [built, "--stdio"] };
  return {
    command: process.execPath,
    args: [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "mcp", "server.ts"), "--stdio"],
  };
}

export type InstallOutcome = "installed" | "updated" | "unchanged" | "conflict" | "invalid" | "skipped";

export interface InstallResult {
  client: string;
  configPath: string;
  outcome: InstallOutcome;
  backupPath?: string;
  message?: string;
}

function backupPathFor(path: string): string {
  const first = `${path}.bak`;
  // Keep the first backup, which is the user's original config, across repeated runs.
  return existsSync(first) ? `${path}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak` : first;
}

function isOrbitLocalEntry(entry: Record<string, unknown>): boolean {
  const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
  return args.includes("--stdio") && args.some((a) => /[\\/]mcp[\\/]server\.(js|ts)$/.test(a));
}

function sameEntry(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function installClient(
  target: ClientTarget,
  launch: { command: string; args: string[] },
  options: { dryRun?: boolean; force?: boolean } = {},
): InstallResult {
  const base = { client: target.name, configPath: target.configPath };
  if (!target.detected) return { ...base, outcome: "skipped", message: "not detected" };

  const exists = existsSync(target.configPath);
  let config: Record<string, unknown> = {};
  if (exists) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(target.configPath, "utf8"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("top level is not an object");
      config = parsed as Record<string, unknown>;
    } catch (error) {
      return { ...base, outcome: "invalid", message: `left untouched: could not parse it (${(error as Error).message})` };
    }
  }

  const rawServers = config.mcpServers;
  if (rawServers !== undefined && (rawServers === null || typeof rawServers !== "object" || Array.isArray(rawServers))) {
    return { ...base, outcome: "invalid", message: "left untouched: mcpServers is not an object" };
  }
  const servers = (rawServers ?? {}) as Record<string, unknown>;
  const entry: McpEntry = { ...(target.typed ? { type: "stdio" as const } : {}), command: launch.command, args: launch.args };
  const current = servers[SERVER_KEY];

  if (current !== undefined && sameEntry(current, entry)) return { ...base, outcome: "unchanged" };
  if (current !== undefined && !options.force && !isOrbitLocalEntry(current as Record<string, unknown>)) {
    return {
      ...base,
      outcome: "conflict",
      message: `an "${SERVER_KEY}" server that isn't Local Orbit is already configured. Re-run with --force to replace it.`,
    };
  }

  const outcome: InstallOutcome = current === undefined ? "installed" : "updated";
  if (options.dryRun) return { ...base, outcome, message: "dry run: nothing written" };

  let backupPath: string | undefined;
  if (exists) {
    backupPath = backupPathFor(target.configPath);
    copyFileSync(target.configPath, backupPath);
  } else {
    mkdirSync(dirname(target.configPath), { recursive: true });
  }

  const mode = exists ? statSync(target.configPath).mode & 0o777 : 0o600;
  const next = { ...config, mcpServers: { ...servers, [SERVER_KEY]: entry } };
  // Replace atomically so an interrupted write can't corrupt the client's config.
  const temp = `${target.configPath}.orbit-${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode });
  chmodSync(temp, mode);
  renameSync(temp, target.configPath);
  return { ...base, outcome, backupPath };
}

export interface WorkspaceResult {
  path: string;
  action: "created" | "updated" | "appended" | "unchanged";
}

/** Writes the protocol into a managed block, so anything else already in the file is preserved. */
export function writeWorkspace(targetFolder: string, projectId: string): WorkspaceResult[] {
  const folder = resolve(targetFolder);
  mkdirSync(folder, { recursive: true });
  return WORKSPACE_FILES.map(({ filename, agentName }) => {
    const path = join(folder, filename);
    const block = workspaceBlock(agentName, projectId);
    if (!existsSync(path)) {
      writeFileSync(path, block);
      return { path, action: "created" };
    }
    const existing = readFileSync(path, "utf8");
    const start = existing.indexOf(BLOCK_START);
    const end = existing.indexOf(BLOCK_END);
    if (start >= 0 && end > start) {
      const tail = existing.slice(end + BLOCK_END.length).replace(/^\r?\n/, "");
      const next = existing.slice(0, start) + block + tail;
      if (next === existing) return { path, action: "unchanged" };
      writeFileSync(path, next);
      return { path, action: "updated" };
    }
    writeFileSync(path, `${existing.trimEnd()}\n\n${block}`);
    return { path, action: "appended" };
  });
}
