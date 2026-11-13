import { getDb } from "./db/index";
import { clientTargets, installClient, stdioLaunch, writeWorkspace, type InstallResult } from "./cli/installer";
import { seed, unseed, DEMO_PROJECT } from "./cli/seed";
import { DASHBOARD_URL, MCP_URL, dbPath } from "./paths";

const USAGE = `Local Orbit CLI

Usage: orbit-cli <command> [options]

Commands:
  init [--dry-run] [--force]              Create ~/.local-orbit and register the orbit MCP server
                                          with Claude Desktop, Claude Code, Cursor, Antigravity,
                                          and the Gemini CLI
  workspace <folder> [--project <slug>]   Write CLAUDE.md, AGENTS.md, .cursorrules, and GEMINI.md
                                          into a folder
  serve                                   Run the HTTP MCP server on port 4100
  stdio                                   Run the MCP server on stdio
  seed                                    Add sample data in the "${DEMO_PROJECT}" project
  unseed                                  Remove the sample data
`;

const SYMBOL: Record<InstallResult["outcome"], string> = {
  installed: "+",
  updated: "~",
  unchanged: "=",
  conflict: "!",
  invalid: "!",
  skipped: "-",
};

function init(args: string[]): number {
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  if (!dryRun) {
    getDb();
    console.log(`Database ready: ${dbPath()}`);
  }

  const launch = stdioLaunch();
  console.log(`\nStdio server: ${launch.command} ${launch.args.join(" ")}\n`);
  console.log(dryRun ? "AI clients (dry run, nothing will be written):" : "AI clients:");

  const results = clientTargets().map((target) => installClient(target, launch, { dryRun, force }));
  for (const r of results) {
    console.log(`  ${SYMBOL[r.outcome]} ${r.client.padEnd(15)} ${r.outcome}${r.message ? `: ${r.message}` : ""}`);
    if (r.outcome !== "skipped") console.log(`    ${r.configPath}`);
    if (r.backupPath) console.log(`    backup: ${r.backupPath}`);
  }

  console.log(`
HTTP MCP URL for web connectors and n8n: ${MCP_URL}
Dashboard: ${DASHBOARD_URL}

Next steps:
  1. Restart your AI clients so they pick up the server.
  2. Start the HTTP server and dashboard with: npm run dev
  3. Add the protocol to a project with: npm run orbit -- workspace <folder>
  4. For Codex, add this to ~/.codex/config.toml:

     [mcp_servers.orbit]
     command = ${JSON.stringify(launch.command)}
     args = ${JSON.stringify(launch.args)}
`);
  return results.some((r) => r.outcome === "conflict" || r.outcome === "invalid") ? 1 : 0;
}

function workspace(args: string[]): number {
  const projectFlag = args.indexOf("--project");
  const project = projectFlag >= 0 ? args[projectFlag + 1] : "default";
  const folder = args.find((a, i) => !a.startsWith("--") && i !== projectFlag + 1 || (projectFlag < 0 && !a.startsWith("--")));
  if (!folder || !project) {
    console.error("Usage: orbit-cli workspace <folder> [--project <slug>]");
    return 1;
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(project)) {
    console.error(`Invalid project slug "${project}". Use lowercase letters, numbers, "-" and "_".`);
    return 1;
  }
  for (const r of writeWorkspace(folder, project)) console.log(`  ${r.action.padEnd(9)} ${r.path}`);
  console.log(`\nAgents working in this folder will report to project "${project}".`);
  return 0;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "init":
      return init(args);
    case "workspace":
      return workspace(args);
    case "serve": {
      const { startHttp } = await import("./mcp/server");
      startHttp();
      return -1;
    }
    case "stdio": {
      const { startStdio } = await import("./mcp/server");
      await startStdio();
      return -1;
    }
    case "seed": {
      const { created } = seed();
      console.log(created ? `Added sample data to project "${DEMO_PROJECT}".` : `Project "${DEMO_PROJECT}" already exists, so nothing changed.`);
      return 0;
    }
    case "unseed":
      unseed();
      console.log(`Removed project "${DEMO_PROJECT}".`);
      return 0;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command "${command}".\n\n${USAGE}`);
      return 1;
  }
}

main()
  .then((code) => {
    if (code >= 0) process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
