import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts", "mcp/server": "src/mcp/server.ts" },
  format: "esm",
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: true,
  external: ["better-sqlite3"],
  banner: { js: "#!/usr/bin/env node" },
});
