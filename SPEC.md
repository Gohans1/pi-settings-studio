# Specification

## Objective
A personal, local GUI for **Pi core configuration**, used next to T3Code. Settings only: no chat, sessions UI, terminal or orchestration. The settings panel of [agegr/pi-web](https://github.com/agegr/pi-web) is the reference for features and feel; it is re-implemented here, not forked.

## Scope: Pi core only
Tabs below. A project picker (folders Pi has sessions in) adds each tab's project scope and shows project trust. Operations that run something (MCP connection test, OAuth sign-in, package install) run only on an explicit click, through Pi's own CLI or runtime.

| Tab | Contents |
|---|---|
| MCP | Global and project `mcp.json` servers: list, enable/disable, exposure, add, edit, remove (undo). Codemode controls: `defaultTools` `+codemode`, `codemode.mode`, `codemode.inlineBudget`, `autoEnableCodemode`. `toolExposure`, `oauth`, `auth.provider`. Import from other clients. Connection test, OAuth sign-in, sign-in state, `mcp.log`. |
| System prompt | Read-only. Pick project, then session (newest first); show the persisted system prompt sections and tool declarations exactly as Pi recorded them in the session file. Copy button. |
| Skills | Discovered skills with source; enable/disable per skill and per group; edit user and project skill files; create skills. |
| General | A form field for every documented `settings.json` key that no other tab owns; terminal-only keys grouped and labelled "no effect in T3Code"; internal keys (`lastChangelogVersion`, `deviceId`, `trackingId`) never touched. Raw JSON editor. Global or project file. Keyboard shortcuts (`keybindings.json`). |
| Instructions | Context files (`AGENTS.md`…), `SYSTEM.md`, `APPEND_SYSTEM.md`, global and project. |
| Models | Providers and API-key status, custom providers/models (`models.json`), default provider/model, enabled models, thinking levels. OAuth sign-in, credential check, model lists from a custom endpoint. |
| Plugins | Packages (install, update, remove, filters) and per-resource toggles; edit and create prompts, themes and extensions. |
| Sub-agents | Profiles in the format of Pi's official example subagent extension (`name`, `description`, `tools`, `model`, prompt body) in `~/.pi/agent/agents/` and `.pi/agents/`. Unknown frontmatter keys are kept. |

Out of scope: configuration that belongs to individual third-party extensions.

## Contract
- **Pi's own logic.** Use public exports of `@earendil-works/pi-coding-agent`, pinned to the Pi version installed on this machine. Where Pi keeps logic internal (for example `mcp.json` validation and edits), port it from Pi's MIT source with attribution and record the Pi version it came from. A test fails when the installed Pi version differs, so the port is re-checked on every update.
- **Files are authoritative.** Agent directory: `PI_CODING_AGENT_DIR`, else `~/.pi/agent`. Fixed document identifiers only, never arbitrary paths from HTTP. Patch only edited keys and keep unknown keys. Never overwrite invalid JSON. Lock with `proper-lockfile` as Pi does, check revisions, stage writes in the same directory and rename. Keep one private backup generation for restore/undo. Refuse symlinked configuration paths.
- **Secrets stay on the server.** `auth.json` values, MCP `env`/`headers` values and OAuth secrets are never sent to the browser. The UI shows names only; edits are write-only (empty means keep).
- **Never execute configuration to display it.** No extension loading or MCP connections on read.
- **Saved means written to the file.** T3Code applies changes after `/reload` or in a new thread. Never claim live state.

## Local HTTP boundary
Bun serves `127.0.0.1:4369` (configurable) and runs in the background. No login. Exact Host and Origin allowlist, Fetch Metadata cross-site rejection, JSON content type for mutations, request body limit, strict CSP, no CORS. This blocks browser-originated attacks (CSRF, DNS rebinding). Processes running as the same user are out of scope: they can already edit the files.

## UI
Horizontal tab bar like pi-web, English, light/dark from the OS, shadcn (Base UI) components. Switches save immediately. Forms save on Save, without a review step. Failed saves keep the draft. Keyboard and narrow-screen support. Tabs that are not implemented are hidden, not faked.

## Commands
Install: `bun install --frozen-lockfile`
Test: `bun test`
Types: `bun run typecheck`
Lint: `bun run lint`
Build: `bun run build`
Browser tests: `bun run test:e2e`
Start: `bun run start`

## Structure
`src/server`: HTTP service and file access. `src/shared`: validated contracts. `src/client`: UI. `tests`: unit/integration tests on temporary directories. `e2e`: browser flows. `docs`: coverage and verification. `tasks`: plan and status.

## Updating (manual)
When asked to update: bump the Pi SDK to the installed Pi version, run the tests (the drift test lists `settings.json` keys without a form; the port test flags ported logic to re-check), then review pi-web settings changes since the commit recorded in `docs/parity.md`.

## Style
ES modules, TypeScript strict mode, named functions, two-space indentation. Boundary validation returns actionable errors, never filesystem stacks.

## Verification
RED → GREEN → refactor for every behavioral slice. Temporary agent/project directories only; never the real `~/.pi`. Each tab is checked in a real browser with screenshots before it counts as done.

## Boundaries
Always: preserve unknown values, use public Pi APIs or attributed ports, record unsupported features.
Ask first: publishing, pushing to a remote, relaxing security, changing AGENTS.md, running installed integrations.
Never: send secrets to the browser, silently overwrite concurrent changes, claim live T3Code state.
