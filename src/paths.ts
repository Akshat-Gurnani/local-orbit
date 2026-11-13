import { homedir } from "node:os";
import { join } from "node:path";

export const MCP_PORT = Number(process.env.ORBIT_MCP_PORT ?? 4100);
export const DASHBOARD_PORT = Number(process.env.ORBIT_DASHBOARD_PORT ?? 3100);
export const DASHBOARD_URL = process.env.ORBIT_DASHBOARD_URL ?? `http://localhost:${DASHBOARD_PORT}`;
export const MCP_URL = `http://localhost:${MCP_PORT}/mcp`;

// Resolved on each call so tests and alternate installs can set ORBIT_HOME.
export function orbitHome(): string {
  return process.env.ORBIT_HOME ?? join(homedir(), ".local-orbit");
}
export const dbPath = () => join(orbitHome(), "orbit.db");
export const filesDir = () => join(orbitHome(), "files");
export const orbitPromptsDir = () => join(orbitHome(), "orbits");
