# Coverage ledger

Reference: [agegr/pi-web](https://github.com/agegr/pi-web) settings panel, re-implemented (not forked). Last reviewed commit: `fdeea87329a291fcebcd54ba41fd2dd0387bfca7` (2026-10-07). On update, review pi-web settings changes after this commit.

Pi baseline: `@earendil-works/pi-coding-agent` 1.1.0 (installed; updated from 1.0.3 on 2026-10-08, no settings key added). Ported Pi logic records this version; tests fail when the SDK or Pi's documentation moves.

## Pi configuration (docs/configuration.md)

| File or folder | Global | Project | Notes |
|---|---|---|---|
| `settings.json` | Done | Done | Every documented key (drift test), startup tools as a checklist (Pi's `defaultTools` resolution, ported and compared with Pi; `codemode` as its state with a link to MCP › Code mode), compaction per model as row editors (thinking level per model is in Models > Defaults), theme picker, raw JSON, global-only keys locked in projects |
| `mcp.json` | Done | Done | Add/edit/remove/undo, switches, exposure, `toolExposure` rules and each tool's exposure after a connection test, `oauth.*` (client secret write-only), `auth.provider` (global only, as Pi requires), Code mode per project, overrides per project, import from other clients, raw JSON with secrets masked, connection test, OAuth sign-in/out and sign-in state, `mcp.log` tail |
| `auth.json` | Done | n/a | Every credential through Pi's own login, as `/login` asks for it: a key, or a key with more (Cloudflare account and gateway IDs, Bedrock profile, Vertex project and location), named as Pi names it; provider OAuth sign-in and sign-out; `pi auth check`. All 42 providers of Pi's model runtime are listed. llama.cpp is a provider Pi ships as a built-in extension (`/login llama.cpp`, `/llama`); Models does not load extensions, so it is not listed: set it up in Pi. Providers that third-party extensions register are not listed either; extension execution is confined to the tool inspector (Plugins and Tools) |
| `models.json` | Done | n/a | Custom providers and models, each API named with what it is for, model list from the endpoint, a provider Pi ships changed by an entry of its own (endpoint, headers, models), raw JSON with keys masked (refused when Pi rejects the file). Per-model `compat`, `cost`, `samplingParams`, `inputLimits`, `promptCache` and `modelOverrides` are edited as raw JSON |
| Defaults (`settings.json`) | Done | Done | Any provider and model can be typed, with Pi's catalog and the providers enabled extensions register as suggestions (read in a probe process that starts no session) and a warning when neither has it, or picked from a provider's model list; the thinking levels the default model offers, and the level Pi starts it at otherwise (Pi's clamp, ported and compared with Pi); thinking level per model; Enabled models as a checklist by provider, as `/scoped-models` edits it, and as patterns matched as Pi matches them (ported, compared with Pi), with why a pattern selects nothing; a default outside a non-empty scope is added to it on save, as Pi does |
| `keybindings.json` | Done | n/a | Every terminal action |
| `AGENTS.md` / `CLAUDE.md` (context files) | Done | Done | Pi's candidate order, parent-folder files listed read-only |
| `SYSTEM.md`, `APPEND_SYSTEM.md` | Done | Done | |
| `extensions/`, `skills/`, `prompts/`, `themes/` | Done | Done | Switches, create, edit (a skill's whole folder); extra folders added to and removed from the settings paths; a skill Pi skips for a duplicate name is marked, with the winner (Pi's own `loadSkills`); the model invocation of a skill or a whole group (all or none, Undo); remove a user or project skill, kept in `.pi-settings-backup/skills` of the agent folder for Undo; package files, built-ins and symbolic links read-only |
| Packages | Done | Done | Install, update, remove through `pi`; resource filters; on-demand update checks via Pi’s public `checkForAvailableUpdates`, per-package badges and last-check timestamp. No automatic polling; Pi silently skips pins/local paths/failed lookups, so an empty result is not a guarantee that everything is current |
| Trust (`trust.json`) | n/a | Done | Pi's ProjectTrustStore; says whether Pi loads `.pi` |
| Sub-agent profiles (`agents/`) | Done | Done | Pi's example extension format |
| Sessions | System prompt view | | Read-only; a custom `sessionDir` is followed (absolute paths for discovery, relative ones per known project) |
| Pi itself | Version, Update Pi | | Version read from the installed package, `pi update --self` on click |

## pi-web settings panel

| pi-web | Here |
|---|---|
| Models: providers, keys, OAuth, custom providers, defaults | Done, plus each provider's models with their limits, thinking levels and price, model discovery from a custom endpoint and credential check |
| MCP: list, toggle, exposure, add/edit/remove, test, OAuth, codemode | Done, plus import from Claude, Cursor, VS Code, OpenCode and Codex |
| Skills | Switches, details, file editor, new skills, remove with Undo, model invocation per skill or group; install/update of skills comes from packages |
| Plugins | Done, plus prompt, theme and extension editors; automatic runtime tool catalogue and direct model-declaration preview, scoped by the project picker ([details](plugin-tools.md)) |
| Agents (sub-agents) | Done in Pi's example format, without pi-web-only fields (thinking, extensions…), which are kept as they are |
| System prompt | From the session files Pi writes, not a live chat |
| General: chat width, Enter to send, notifications, language, PowerShell | Excluded on purpose (chat product or Windows-only) |

## Not possible in this app

Listed in the app too (General, "Not editable here"):

- Environment variables (`PI_*`, provider keys) of the process Pi starts in; Check credential sees this app's environment only.
- llama.cpp, which Pi ships as a built-in extension, and providers and models that extensions or packages register (claude-bridge…): Models does not load extensions; the Plugins tool inspector does not export their provider catalogues. Their names can still be typed as defaults and patterns, with a warning.
- Command-line options of a run (`--model`, `--tools`, `--session-dir`, `--no-mcp`…).
- Live state of running threads; files apply after `/reload` or in a new thread.
- Sessions and chat history, files inside installed packages, third-party extension settings.
- Showing stored keys and tokens: write-only by design.
