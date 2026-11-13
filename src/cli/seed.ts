import {
  acknowledgeCommand,
  createOrbit,
  enqueueCommand,
  ensureProject,
  getProject,
  promoteVaultItem,
  recordHeartbeat,
  removeProjectData,
  saveFile,
  saveVaultItem,
  updateSynthesizedState,
} from "../db/index";

// Sample data stays in its own project so real agents working in "default" never see it.
export const DEMO_PROJECT = "orbit-dev";

export function seed(): { created: boolean } {
  if (getProject(DEMO_PROJECT)) return { created: false };

  ensureProject(DEMO_PROJECT, "Orbit Dev", "Sample project showing how agents share context in Local Orbit.");
  updateSynthesizedState(
    DEMO_PROJECT,
    `# Local Orbit: current state

**Status:** v0.1 is in local dogfooding.

**Strategy:** Keep every AI tool's memory in one SQLite file on this machine. Agents read canonical knowledge before acting and write their work back, so the user stops being the copy-paste bridge between tools.

**Next up:** Connect Claude Code and Codex to the same project, then run the first scheduled Orbit.`,
  );

  const claude = recordHeartbeat({
    project_id: DEMO_PROJECT,
    agent_name: "claude-code",
    title: "Implement FTS5 search across the vault",
    event_type: "heartbeat",
    message: "Started on vault search.",
    status: "active",
  });
  const milestone = (run_id: string, agent_name: string, title: string, message: string) =>
    recordHeartbeat({ run_id, project_id: DEMO_PROJECT, agent_name, title, event_type: "milestone", message });
  milestone(claude.id, "claude-code", claude.title, "FTS5 table and sync triggers are in place.");
  recordHeartbeat({
    run_id: claude.id,
    project_id: DEMO_PROJECT,
    agent_name: "claude-code",
    title: claude.title,
    event_type: "heartbeat",
    message: "Tuning ranking so knowledge items come first.",
    summary: "Added the FTS5 index and triggers. Ranking is being tuned so verified knowledge sorts ahead of reports.",
    ai_insights: "External-content FTS tables rely on rowids, which VACUUM can change on TEXT primary key tables. A standalone index keyed on item ID avoids this.",
  });

  const codex = recordHeartbeat({
    project_id: DEMO_PROJECT,
    agent_name: "codex",
    title: "Compare memory layer options",
    event_type: "heartbeat",
    message: "Comparing storage options for shared agent memory.",
    status: "active",
  });
  milestone(codex.id, "codex", codex.title, "Finished benchmarks for SQLite and a hosted vector store.");

  const report = saveVaultItem({
    project_id: DEMO_PROJECT,
    run_id: codex.id,
    tier: "report",
    title: "Storage options for shared memory",
    content: `## Summary

SQLite with FTS5 covers keyword recall for a single user. A hosted vector store adds semantic recall, but also adds a network dependency and a monthly bill.

## Open question

Do we need semantic search at all before the vault holds a few thousand items?`,
    tags: ["research", "storage"],
  });
  const decision = saveVaultItem({
    project_id: DEMO_PROJECT,
    run_id: claude.id,
    tier: "report",
    title: "Memory stays local-first",
    content: `All memory lives in \`~/.local-orbit/orbit.db\`. Nothing leaves the machine unless the user sets up a tunnel themselves.

The user confirmed this decision on the storage review.`,
    tags: ["architecture", "decision"],
  });
  promoteVaultItem(decision.id);
  saveVaultItem({
    project_id: DEMO_PROJECT,
    tier: "note",
    title: "Useful FTS5 reference",
    content: "Quote each search token so hyphens and FTS operators in user input can't break the query. Use `bm25()` to rank results; lower scores are better.",
    tags: ["reference"],
  });

  const file = saveFile({
    project_id: DEMO_PROJECT,
    run_id: codex.id,
    filename: "memory-layer-comparison.md",
    summary: "Comparison of SQLite FTS5 and a hosted vector store for shared agent memory.",
    content: `# Memory layer comparison

| Option | Recall | Runs offline | Monthly cost |
| --- | --- | --- | --- |
| SQLite + FTS5 | Keyword | Yes | $0 |
| Hosted vector store | Semantic | No | Varies by plan |

**Recommendation:** Start with SQLite and FTS5. Revisit semantic search once keyword recall visibly misses things.

*These are illustrative sample values.*
`,
  });
  recordHeartbeat({
    run_id: codex.id,
    project_id: DEMO_PROJECT,
    agent_name: "codex",
    title: codex.title,
    event_type: "result",
    message: `Filed the comparison: ${file.filename}`,
    status: "completed",
    summary: "Compared local and hosted memory options, and filed a report and a comparison document.",
    ai_insights: "Keyword search is enough for now. Semantic search can be added later without changing the vault's tiers.",
    metadata: { file_id: file.id, vault_item_id: report.id },
  });

  // Acknowledged immediately, so no agent ever receives this sample as a live instruction.
  const command = enqueueCommand({
    project_id: DEMO_PROJECT,
    target_agent: "claude-code",
    instruction: "Next time you run, prioritize the search ranking work.",
  });
  acknowledgeCommand(command.id);

  createOrbit({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Morning AI News Digest",
    project_id: DEMO_PROJECT,
    goal_prompt: "Compile a daily morning AI news digest with sources. Cover model releases, developer tooling, and funding, with at most ten items.",
    target_platform: "claude-code",
    schedule_cron: "0 8 * * *",
  });

  return { created: true };
}

export function unseed(): void {
  removeProjectData(DEMO_PROJECT);
}
