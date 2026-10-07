# Capability map

Implementation authorized by the user's instruction to proceed with the agreed architecture; this detailed decomposition has not had separate human review.

| Module | Responsibility | Depends on |
|---|---|---|
| config-store | Scoped native-file reads, validated patch writes, conflict checks, backups | — |
| local-server | Loopback authentication, bounded requests, on-demand lifecycle | config-store |
| settings-ui | Accessible search, forms, provenance, unsaved changes, recovery | local-server |
| integrations | Provider credentials/OAuth, MCP, skills, packages, subagent profiles | config-store, local-server, settings-ui |
| pi-launcher | Host-provided extension API and standalone entry point | local-server |
| core-coverage | Remaining documented Pi settings/resources | integrations |

Build order: config-store → local-server → settings-ui → integrations → pi-launcher → core-coverage → release verification.
