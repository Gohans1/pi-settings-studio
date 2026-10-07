# Implementation plan

The user authorized proceeding with the agreed stack and pi-web-first scope. These are verification slices, not a reduction to an MVP. Tasks are tracked only in tasks/todo.md.

1. Pin baseline and dependencies; establish safe isolated tests.
2. Native-file transactions (risk-first): known-key patches, revision checks, interoperable locks, backups, recovery, constrained paths.
3. Authenticated on-demand server; no config execution.
4. First end-to-end forms: model defaults and codemode, global/project scope, change review, reload notices, responsive UI.
5. Complete integration groups from docs/parity.md, with per-flow tests.
6. Thin Pi command launcher; public API imports only. Standalone shares server implementation.
7. Complete residual core coverage and packaged compatibility tests.

Primary risks: losing edits from other sessions (locks+revision), leaking secrets (allowlisted responses), executing packages on inspection (no auto-load), version drift (pinned docs/catalogue), T3 runtime mismatch (honest persisted-state labeling). No unverified API signatures; unresolved integration contracts are researched before implementing their slices.
