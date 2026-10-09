# Extension tools

Selecting an extension in Plugins automatically inspects it with the pinned Pi SDK (1.1.0). No extra project or session selector is needed. `None` uses global configuration only; a selected project adds its settings and extensions. Refresh tools starts a fresh inspection.

## Kept results

An inspection starts Pi, every enabled extension and every MCP server, so the server keeps a complete one in memory and answers the same request with it while nothing it read has changed: the global and project `settings.json` and `mcp.json`, `auth.json`, `mcp-auth.json` (MCP sign-in) and the extensions' own files, for ten minutes at most. Refresh tools sends `fresh: true` for a new one. An incomplete result is not kept, so the next visit tries again. Not noticed until Refresh tools or the age limit: a file an extension imports, and an MCP server whose tools change without a configuration change. The browser also keeps the last result per tab, extension and project, so returning shows it at once with "Checking for changes…" while it asks again.

- **All tools** lists tools registered by that extension during loading and `session_start`, including dynamic registrations. It does not promise tools that may be created by later commands or turns.
- **Model sees** counts direct model declarations at startup. Pi's `prepareLoadout` hidden declarations (including codemode-only mode) are excluded. Indirect tools may still appear inside codemode's description; they are labelled **Indirect only**, not unreachable.
- Disabled extensions are loaded for their catalogue but every tool is labelled **Extension off**. No settings are changed to enable them.
- Failures display an incomplete/unverified result, never a successful empty catalogue. The refresh action retries. Inspection times out after 30 seconds; changing selection cancels the client request.

## Tools tab

Tools runs the same inspection without a selected extension, when the tab opens and on Refresh tools, and lists every tool the session registers. Each tool belongs to a source: Pi's own tools (`builtin:<tool>`), an extension (named as in Plugins; built-in ones such as code mode are listed as built into Pi), or an MCP server, named as configured in `mcp.json`: tool names only carry the sanitized `mcp__<server>` namespace, which the tab drops from a tool's name under its server. Its reach is **Model sees** (a declaration), **On demand** (reached through code mode or tool search, as Pi's MCP docs describe), **Off** (registered but not in the startup tool set) or **Hidden**.

The response also lists `idleSources`: extensions and MCP servers a session takes no tools from, turned off in settings or on without any. Servers come from Pi's merge of the global and project `mcp.json` (`readMcpServers`), so a project override that turns a server off counts. Only enabled extensions load, so a tool is never labelled Extension off or shadowed here. A failure keeps the tools found and says the list may be incomplete.

## Trust and side effects

The owner explicitly trusts installed extensions. Inspection loads enabled extensions plus the selected extension in a disposable Bun subprocess, with the app's environment and OS permissions. It is **not a sandbox**: extension code can access files and the network, and its own side effects are not rolled back. Configured MCP servers connect as they do at Pi startup. The app itself does not prompt a model or execute a model tool to inspect the catalogue.

The selected project is trusted **for the preview**, without modifying Pi's saved trust decision. T3Code may still ignore an untrusted project's configuration; the existing trust banner continues to explain that. Thread-specific flags, environment variables and later lifecycle changes are not represented.

The inspector uses in-memory settings/session storage and skips missing packages rather than installing them. It shuts down the inspection runtime and its process group. Resource-list GETs remain non-executing; the browser uses a same-origin POST to inspect a discovered extension. Known credentials are redacted from returned descriptions and diagnostics, and subprocess console output is not sent to the browser.

## Pi contracts used

- `docs/extensions.md`: registrations, exposure, dynamic tools, `prepareLoadout`.
- `docs/sdk.md`, `examples/sdk/14-codemode-mcp.ts`: `DefaultResourceLoader`, `createAgentSession`, `bindExtensions`, in-memory sessions.
- Public runtime metadata: extension tool maps, `getAllTools`, `getActiveToolNames`, `getCallableToolNames`, and the command context's `getSystemPromptOptions().hiddenTools`.
- Pi 1.1.0's internal `dist/extensions/index.js` supplies the CLI's exact built-in factories and replacement flags. This aggregate is not publicly exported; re-check it when updating Pi. No source is copied.
- The built-in `/mcp` status command in RPC mode awaits pending connections. Only Pi's built-in command is invoked, not a third-party command named `mcp`.

## Verification

`tests/tools-api.test.ts` and `e2e/tools.spec.ts` cover the Tools tab: sources (an MCP server name with a dash), reach, idle sources and a project override, project settings, an MCP startup failure, credential masking, the two pinned views, a source's detail, search, the 320px workbench and accessibility. `tests/plugin-tools-api.test.ts` exercises actual Pi registration, dynamic startup tools, project codemode-only mode, disabled extensions, computed names, failures, credential masking, scope validation, timeouts/cancellation and process crashes on temporary directories. `e2e/plugin-tools.spec.ts` covers automatic loading, filters, toggles, the existing project picker, keyboard/mobile use, accessibility, retry, empty results and stale responses. No installed user extension is needed by the tests.
