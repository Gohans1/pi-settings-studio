# Implementation plan

Decisions are recorded in SPEC.md. Each step is a tested, committed slice.

1. Rescope documents.
2. Runtime: Bun server on port 4369, no login (Host/Origin checks stay), no review step.
3. App shell: horizontal tab bar; current fields stay under General until their tabs exist.
4. MCP tab: read-only list and details → enable/disable and exposure → add/edit/remove with undo → codemode controls.
5. System prompt tab.
6. Skills tab.
7. General tab: remaining keys, drift test, raw JSON editor.
8. Models tab.
9. Plugins tab.
10. Sub-agents tab.
11. Background service (systemd user unit; needs one WSL restart by the user).
12. Execution features per tab: MCP test/OAuth, model OAuth, package install.
