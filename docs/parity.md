# Coverage ledger

Reference: [agegr/pi-web](https://github.com/agegr/pi-web) settings panel, re-implemented (not forked). Last reviewed commit: `fdeea87329a291fcebcd54ba41fd2dd0387bfca7` (2026-10-07). On update, review pi-web settings changes after this commit.

Pi baseline: `@earendil-works/pi-coding-agent` 1.0.3 (installed). Ported Pi logic records this version; tests fail when the SDK or Pi's documentation moves.

## Pi configuration (docs/configuration.md)

| File or folder | Global | Project | Notes |
|---|---|---|---|
| `settings.json` | Done | Done | Every documented key (drift test), raw JSON, global-only keys locked in projects |
| `mcp.json` | Done | Done | Add/edit/remove/undo, switches, exposure, Code mode, overrides per project, connection test, OAuth sign-in/out. Not edited by form: `toolExposure` per tool, `oauth.*`, `auth.provider` (kept as they are) |
| `auth.json` | Done | n/a | API keys (write-only), provider OAuth sign-in through Pi's runtime |
| `models.json` | Done | n/a | Custom providers and models; compat, modelOverrides and model extras kept as they are |
| `keybindings.json` | Done | n/a | 90 terminal actions (no effect in T3Code) |
| `AGENTS.md` / `CLAUDE.md` (context files) | Done | Done | Pi's candidate order, parent-folder files listed read-only |
| `SYSTEM.md`, `APPEND_SYSTEM.md` | Done | Done | |
| `extensions/`, `skills/`, `prompts/`, `themes/` | Switches | Switches | Built-ins included; creating or editing those files is not in scope |
| Packages | Done | Install `-l` | Install, update, remove through `pi`; project packages listed through their resources |
| Trust (`trust.json`) | n/a | Done | Pi's ProjectTrustStore; says whether T3Code loads `.pi` |
| Sub-agent profiles (`agents/`) | Done | Done | Pi's example extension format |
| Sessions | System prompt view | | Read-only; a custom `sessionDir` is not followed |

## pi-web settings panel

| pi-web | Here |
|---|---|
| Models: providers, keys, OAuth, custom providers, defaults | Done; model discovery from a custom endpoint is not implemented |
| MCP: list, toggle, exposure, add/edit/remove, test, OAuth, codemode | Done; pasting a config from another client is not implemented |
| Skills | Switches and details; install/update of skills comes from packages |
| Plugins | Done |
| Agents (sub-agents) | Done in Pi's example format, without pi-web-only fields (thinking, extensions…), which are kept as they are |
| System prompt | From the session files T3Code writes, not a live chat |
| General: chat width, Enter to send, notifications, language, PowerShell | Excluded on purpose (chat product or Windows-only) |
