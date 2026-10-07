# Coverage ledger

Reference: [agegr/pi-web](https://github.com/agegr/pi-web) settings panel, re-implemented (not forked). Last reviewed commit: `fdeea87329a291fcebcd54ba41fd2dd0387bfca7` (2026-10-07). On update, review pi-web settings changes after this commit.

Pi baseline: `@earendil-works/pi-coding-agent` 1.0.3 (installed). Ported Pi logic records this version.

| Tab | pi-web source | Status |
|---|---|---|
| MCP: list, enable/disable, exposure, add/edit/remove, codemode | components/McpConfig.tsx; app/api/mcp; app/api/tools/settings | Done for the global mcp.json; project group pending (needs the project picker) |
| MCP: connection test, OAuth sign-in, paste import | components/McpConfig.tsx; lib/mcp-test.ts; lib/mcp-import-core.ts | Later |
| System prompt (from T3Code session files, not pi-web's live chat) | components/SystemPromptPanel.tsx | Done; a custom `sessionDir` setting is not followed yet |
| Skills: discovery, details, enable/disable | components/SkillsConfig.tsx; app/api/skills | Done for user and package skills; project skills pending (project picker) |
| General: remaining `settings.json` keys, raw JSON, theme | components/SettingsPanel.tsx (chat options intentionally excluded) | Done: every documented key, drift test, raw JSON; app theme follows the OS |
| Models: providers, keys, custom models, defaults, thinking | components/ModelsConfig.tsx; app/api/models-config | Pending |
| Models: OAuth login | app/api/auth | Later |
| Plugins: packages and resource toggles | components/PluginsConfig.tsx; app/api/plugins | Done for user scope (built-ins, user files, package resources); project scope pending |
| Plugins: install, update, remove | app/api/plugins | Later |
| Sub-agents (Pi example format) | components/AgentsConfig.tsx; app/api/subagents | Done for ~/.pi/agent/agents; project profiles and T3Code integration pending |

Excluded on purpose: pi-web chat options (width, font size, quoting, Enter to send, thinking expansion), push notifications, language selection, web-account logout, PowerShell switch (Windows only).
