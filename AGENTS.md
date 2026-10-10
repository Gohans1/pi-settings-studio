# AGENTS.md

Pi Settings Studio is a local settings GUI for Pi. PRODUCT.md, SPEC.md and DESIGN.md hold the product, scope and design rules; read the part you change first.

## Loading data

- A view loads what it shows when it opens. Never put a read behind a button.
- Slow reads use `useCached` (src/client/useCached.ts). Its key names everything the load reads; the last result shows at once while it loads again, and Refresh asks for a fresh one.
- Buttons are for writes and for jobs with side effects (sign-in, install, update, Test connections), which run through `useJob`.
- One fact, one source. The tools a session gets come from the tool inspection (`/api/tools`, src/server/plugin-tools-probe.ts). MCP servers' state and the tools they offer come from Pi's report (`/api/mcp/status`, `pi mcp list --json`).
- After a write that can change what a cached read returns, refresh that read.
- Checks that reach the network on their own (package and Pi updates) run in the background at most once a day, keep their result in pi-settings-cache.json, and skip with PI_OFFLINE. The app turns them on (`checkUpdates`); tests turn them on only where they test them.

## Rules and comments

- Product rules live here or in DESIGN.md, not in code comments. A comment says why the code does what it does. When a comment disagrees with these files, fix the comment.
- A rule is kept by a test. Write the failing test first, then the code.
- Browser tests never start commands or servers that reach the network. When a fixture names one (`npx`, a remote URL), answer the request in that spec instead (`/api/mcp/status`, `/api/tools`).

## Checks

Run `bun test`, `bun run typecheck` and `bun run lint`, then `bun run build` before `bun run test:e2e` (Playwright serves dist/client). Record each change and how it was verified at the top of docs/verification.md.
