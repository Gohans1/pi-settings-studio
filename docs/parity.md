# Coverage ledger

Reference: [agegr/pi-web](https://github.com/agegr/pi-web) settings panel, re-implemented (not forked). Last reviewed commit: `fdeea87329a291fcebcd54ba41fd2dd0387bfca7` (2026-10-07). On update, review pi-web settings changes after this commit.

Pi baseline: `@earendil-works/pi-coding-agent` 1.1.0 (installed; updated from 1.0.3 on 2026-10-08, no settings key added). Ported Pi logic records this version; tests fail when the SDK or Pi's documentation moves.

## Pi configuration (docs/configuration.md)

| File or folder | Global | Project | Notes |
|---|---|---|---|
| `settings.json` | Done | Done | Every documented key (drift test), model maps as row editors, theme picker, raw JSON, global-only keys locked in projects |
| `mcp.json` | Done | Done | Add/edit/remove/undo, switches, exposure, `toolExposure` rules, `oauth.*` (client secret write-only), `auth.provider` (global only, as Pi requires), Code mode per project, overrides per project, import from other clients, raw JSON with secrets masked, connection test, OAuth sign-in/out and sign-in state, `mcp.log` tail |
| `auth.json` | Done | n/a | API keys (write-only), provider OAuth sign-in through Pi's runtime, `pi auth check` |
| `models.json` | Done | n/a | Custom providers and models, model list from the endpoint, raw JSON with keys masked (refused when Pi rejects the file) |
| `keybindings.json` | Done | n/a | Every terminal action (no effect in T3Code) |
| `AGENTS.md` / `CLAUDE.md` (context files) | Done | Done | Pi's candidate order, parent-folder files listed read-only |
| `SYSTEM.md`, `APPEND_SYSTEM.md` | Done | Done | |
| `extensions/`, `skills/`, `prompts/`, `themes/` | Done | Done | Switches, create, edit (a skill's whole folder); package files, built-ins and symbolic links read-only |
| Packages | Done | Done | Install, update, remove through `pi`; resource filters per package |
| Trust (`trust.json`) | n/a | Done | Pi's ProjectTrustStore; says whether T3Code loads `.pi` |
| Sub-agent profiles (`agents/`) | Done | Done | Pi's example extension format |
| Sessions | System prompt view | | Read-only; a custom `sessionDir` is followed (absolute paths for discovery, relative ones per known project) |
| Pi itself | Version, Update Pi | | Version read from the installed package, `pi update --self` on click |

## pi-web settings panel

| pi-web | Here |
|---|---|
| Models: providers, keys, OAuth, custom providers, defaults | Done, plus model discovery from a custom endpoint and credential check |
| MCP: list, toggle, exposure, add/edit/remove, test, OAuth, codemode | Done, plus import from Claude, Cursor, VS Code, OpenCode and Codex |
| Skills | Switches, details, file editor, new skills; install/update of skills comes from packages |
| Plugins | Done, plus prompt, theme and extension editors |
| Agents (sub-agents) | Done in Pi's example format, without pi-web-only fields (thinking, extensions…), which are kept as they are |
| System prompt | From the session files T3Code writes, not a live chat |
| General: chat width, Enter to send, notifications, language, PowerShell | Excluded on purpose (chat product or Windows-only) |

## Not possible in this app

Listed in the app too (General, "Not editable here"):

- Environment variables (`PI_*`, provider keys) of the process T3Code starts Pi in; Check credential sees this app's environment only.
- Command-line options of a run (`--model`, `--tools`, `--session-dir`, `--no-mcp`…).
- Live state of running threads; files apply after `/reload` or in a new thread.
- Sessions and chat history (T3Code), files inside installed packages, third-party extension settings, T3Code's own settings.
- Showing stored keys and tokens: write-only by design.
