# Capability map

| Module | Responsibility | Depends on |
|---|---|---|
| config-store | Locked, revision-checked, backed-up reads and writes of fixed Pi documents | — |
| local-server | Loopback-only HTTP API with Host/Origin checks; static UI | config-store |
| app-shell | Tab bar, theme, shared feedback and file actions | local-server |
| mcp | `mcp.json` servers and codemode settings (Pi logic ported from 1.0.3) | config-store, app-shell |
| system-prompt | Persisted system prompt and tools from Pi session files | local-server, app-shell |
| skills | Skill discovery and enable/disable through the Pi SDK | config-store, app-shell |
| general | Remaining `settings.json` keys, raw JSON editor, drift test | config-store, app-shell |
| models | Providers, credentials status, custom models, defaults | config-store, app-shell |
| plugins | Packages and resource toggles | config-store, app-shell |
| sub-agents | Profiles in Pi's example subagent format | app-shell |
| background-service | systemd user unit on port 4369 | local-server |

Build order: config-store → local-server → app-shell → mcp → system-prompt → skills → general → models → plugins → sub-agents → background-service.
