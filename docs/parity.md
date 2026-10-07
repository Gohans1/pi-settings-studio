# Coverage ledger — NOT a completion claim

Baseline: [agegr/pi-web](https://github.com/agegr/pi-web/tree/7aaeff97f8ee33c9b2239ec3f5f3e3ae16f0a39a), commit `7aaeff97f8ee33c9b2239ec3f5f3e3ae16f0a39a` inspected 2026-10-07. Source paths below are relative to that immutable tree. Inventory remains subject to full source review; release cannot label parity complete until every row has evidence.

| Capability | Source | Status |
|---|---|---|
| Provider catalogue, API-key status/add/remove, OAuth login/logout | components/ModelsConfig.tsx; app/api/models-config | Pending |
| Custom provider endpoints/models, defaults, enabled models, thinking | components/ModelsConfig.tsx | Partial: defaults/thinking/model patterns implemented; custom provider/model CRUD and provider catalogue still pending |
| MCP global/project add/edit/toggle; command/URL, env, headers | components/McpConfig.tsx; app/api/mcp | Pending |
| MCP connect/test, OAuth, tool exposure/search/codemode, remove/undo | components/McpConfig.tsx; app/api/mcp | Pending |
| Codemode mode and inline tool-list budget | docs/adr/0006-mcp-and-code-mode.md | Implemented persisted-file forms; API/browser verification. Live host exposure/reload remains integration work |
| Skills discovery, details, install/update/check, per-item/group toggles | components/SkillsConfig.tsx; app/api/skills/route.ts | Pending |
| Packages install/update/check/remove; scoped/group/individual resource toggles | components/PluginsConfig.tsx; app/api/plugins/route.ts | Pending |
| Subagent profiles create/edit/duplicate/delete, tool/model/thinking fields, enable/concurrency | components/AgentsConfig.tsx; app/api/subagents | Pending |
| System-prompt viewer with honest filesystem vs live-session distinction | components/SystemPromptPanel.tsx; lib/exact-system-prompt.ts | Pending |
| Shell/PowerShell preference | components/SettingsPanel.tsx; app/api/tools/settings | Pending |
| Theme/language and GUI preferences | components/SettingsPanel.tsx | Pending equivalent applicable controls |
| Chat-specific width/enter/quote/thinking presentation, push notifications, web-account logout | components/SettingsPanel.tsx | Baseline inventoried; no chat product planned. Applicability must be explicitly resolved before parity sign-off. |

Skill disabling must preserve pi-web semantics: `disable-model-invocation` does NOT disable explicit /skill invocation. Source discovery never executes plugins or MCP commands. Authentication is never inferred from the presence of a model name.

## Pi core after parity
Installed baseline docs: @earendil-works/pi-coding-agent 1.0.3, docs/settings.md and docs/configuration.md. Registry stable at research: 1.0.4. Core completion requires mapping every documented setting including cache warming, compaction/overrides, retries/transport/proxy, budgets, shell, trust, telemetry, TUI/keybindings, resource paths, prompt and instruction layers. Environment and CLI overrides must be identified as such rather than silently rewritten. Runtime/T3-injected state requires host capabilities and cannot be reconstructed exactly from files.

## Release gates
- [ ] Source review and evidence for every settings-management row
- [ ] Remaining Pi-core settings mapped and tested
- [ ] No unresolved security or correctness blockers
- [ ] On-demand extension tested in Pi and T3 RPC; no stdout pollution
- [ ] Packed npm install works without Bun/frontend build
- [ ] Windows/macOS/Linux matrix tested before claiming support
- [ ] Public package identity and license confirmed
