# Hosting and distribution

Local Orbit is designed to run on the machine where your AI tools run. This page covers how to share it with other people, and what it would take to host it.

## Recommended: each person installs it locally

This works today. Each person runs the steps in the README's quick start, and gets their own private memory in `~/.local-orbit`.

Ways to make that easier, in order of effort:

| Step | What it gives people | Work needed |
| --- | --- | --- |
| Clone from GitHub | Works now | None |
| Publish to npm | `npx local-orbit init` with no clone | Remove `"private": true`, ship `dist/` and the built dashboard in the package, and make `init` point clients at the installed package path |
| Run on login | Dashboard is always available | Add a `launchd` (macOS) or `systemd` (Linux) unit that runs `npm run start` |
| Desktop bundle | One download, no terminal | Package with Tauri or Electron. This is a larger project |

## Why it can't be deployed to Vercel as is

| What Local Orbit does | Why that fails on Vercel |
| --- | --- |
| Stores everything in a SQLite file | Serverless functions have no persistent disk, so the database would reset |
| Uses `better-sqlite3`, a native module | It can run in a function, but only against that temporary disk |
| Runs a long-lived MCP server on port 4100 | Vercel runs short-lived functions, not standing servers |
| Clients launch the server over stdio | A hosted server can't be launched by a desktop app. Only the HTTP transport would apply |
| Has no login | Anyone with the URL could read and write your memory |
| Keeps your data on your machine | Hosting it removes the main reason to use it |

Deploying the current code would produce a dashboard that loses its data and that anyone could open.

## What a hosted version would need

Treat this as a separate product, closer to the hosted service that inspired this project.

1. **Database.** Replace SQLite with a hosted database. Turso (libSQL) is the smallest change, because it keeps SQLite syntax and FTS5. Postgres would mean rewriting search with `tsvector`.
2. **Files.** Move saved files from `~/.local-orbit/files` to object storage such as Vercel Blob.
3. **MCP endpoint.** Serve the Streamable HTTP transport from a route handler in stateless mode. Drop stdio and the legacy SSE transport.
4. **Accounts.** Add sign-in, and scope every table by user. Issue each user a private MCP URL or token.
5. **Live updates.** The dashboard polls the database once a second per open tab. Replace that with a cheaper change feed.
6. **Client setup.** Users would add a URL as a custom connector, so `init` would no longer be needed.

The repository layer in `src/db/index.ts` is the only code that touches the database, which keeps step 1 contained. Steps 3 and 4 are the bulk of the work.

## A middle path: a landing page on Vercel

A static page that explains the project, shows the demo video, and links to the install steps deploys to Vercel without any of the changes above. It gives people one link to share while the tool itself stays local.

## Reaching your own instance remotely

To use your local instance from a phone or a web connector, put it behind a tunnel such as Tailscale or Cloudflare Tunnel, and set the tokens described under "Remote access" in the README. Your data stays on your machine.
