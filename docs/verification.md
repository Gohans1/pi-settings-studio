# Verification — the project is licensed MIT and packaged to be published, 2026-10-11

Scope: the repository said "Personal tool, not published": `private: true`, `UNLICENSED`, no LICENSE, no `bin` or `files`. It is now MIT, with a `pi-settings-studio` bin that runs under Bun, a `files` list that ships only `src/server`, `src/shared` and the built `dist/client`, and a `prepack` that builds the client. Version 0.1.0. It is not on npm yet. The package has no `pi-package` keyword: it holds no extension, skill, prompt or theme, so the Pi package gallery has nothing to load from it.

- `tests/package-metadata.test.ts` keeps the rules: not private, MIT with a LICENSE file, a Bun bin that ships with what it serves and imports and without tests, every shipped source folder present, repository and `engines.bun` set. It failed on the old `package.json` (4 of 4), then passed.
- README says what the app is, shows it, says it is unofficial, and has a Security section; PRODUCT.md and SPEC.md drop "personal". Screenshots in docs/screenshots come from a demo agent folder under a temporary HOME (no real settings, skills or paths).

| Check | Result |
|---|---|
| RED/GREEN | `bun test ./tests/package-metadata.test.ts`: 4 failed on the old `package.json`, 4 passed after |
| `bun test` | 384 passed (52 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 172 passed |
| `npm pack` | 55 files, 389 kB: LICENSE, README, THIRD_PARTY_NOTICES, `src/server`, `src/shared`, `dist/client`; none of tests, e2e, `.codegraph`, `.env*`, docs/evidence |

Manual: the tarball was installed with `bun add` into an empty folder and started from there (`./node_modules/.bin/pi-settings-studio --port 4391`, temporary agent folder, `PI_OFFLINE=1`): `/` answered 200 text/html and the built script 200, so the static folder resolves from another working directory. The three screenshots were taken with agent-browser at 1440×900 on port 4392 (own session, closed after); console clean.

Not checked: `bunx pi-settings-studio` from the npm registry (nothing is published), Bun newer than 1.4.2, and a Windows or macOS host.

---

# Verification — the workbench list runs down the window's edge, and the page scrolls as one, 2026-10-10

Scope: the framed split view sat in a centred 80rem box under the page header, at least 28rem tall, inside `main`, which scrolls too: three scrollers, one inside another, and at 1376×640 every tab's page scrolled 22–166px before either pane did. The list now runs down the window's left edge and the page beside it is the one scroller (B, drawn in the thread).

- The list is fixed down the window's left edge under the tabs and scrolls on its own in its ScrollArea, as shadcn's Sidebar sits under a site header (registry block sidebar-16: `top-(--header-height) h-[calc(100svh-var(--header-height))]`). `main` draws the column (`main::before`), so it is there while a tab loads and the page does not move sideways when the list arrives.
- The detail has no ScrollArea: `main` scrolls it with the page header, out to the window's right edge. `--page-width` and `--radius-frame` are gone.
- Choosing an item while the page is scrolled shows the item from its top (`showDetail` in `ListItem`); a tab opens at its top (`App`, before paint).
- With nothing capping the page, rows of label and control, the save bar, file text and its editors stop at 60rem, beside the JSON editor's existing 60rem; lists run to the edge.
- The save bar's actions follow its count, as a form's save row starts with them. The bar now reaches the window's bottom edge, where a kept confirmation toast covered Save (found by the startup tools test in tools.spec.ts).
- Below 56rem nothing changes: the panes take turns and the page scrolls.
- DESIGN.md › Overview, Layout, Shapes, Forms, General and Context say so.

| Check | Result |
|---|---|
| RED/GREEN | Each failed on the old code, then passed: list geometry at 1920×720 (x 0, from the tabs to the bottom; page header past 1600px); one scroll area on MCP (2 before); a long MCP form scrolls the page on a wide screen with Save in view; the list's column while MCP loads (page header x 32, then 352); Network & retries shown from its top after reading down Terminal UI; a cached Tools tab opens at 0 at 390×480 (651 before); setting rows, the AGENTS.md editor and a Context part's text at most 960px at 1920 (1536 before). Two first passed by chance (short content clamps the scroll) and were changed until they failed for the reason they name. |
| `bun test` | 380 passed (51 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 172 passed |
| `impeccable detect` | No findings in styles.css, Workbench.tsx, App.tsx |

Manual (agent-browser at 1376×640, 1920×1080 and 390×844, dark, MCP also light; this branch on port 4370 with the real agent folder, `PI_OFFLINE=1`): Tools › What the model doesn't see scrolls the page 913px while the list stays; choosing Core tools then lands its heading under the tabs; on 390px, General scrolled 900px, then Tools opens at 0; at 1920 General's rows end at 1312px and the save bar reads "1 unsaved change, Discard, Save" from the left. Console clean, nothing overflows sideways.

Not changed: the page description and the Tools summary keep their 72ch measure, so they still wrap on a wide screen. Between about 56rem and 66rem of window width a kept toast can still cover the save bar's Save; below 40rem the full-width toast covers the bar, as before.

---

# Verification — a list's rows are regular weight, the chosen one medium, 2026-10-10

Scope: with group names drawn as 12px labels, rows kept Item's medium weight (500), which Segoe UI on Windows draws near semibold, so on the desktop a list read as bold rows over a faint label. shadcn's `SidebarMenuButton` (registry, base-nova: `text-sm`, `data-active:font-medium`) and Primer's ActionList `.ItemLabel` (`--base-text-weight-normal`) keep rows regular and mark only the chosen one.

- `ListItem`'s name is `font-normal`, `font-medium` while its Item is pressed (chosen). `.oxlintrc.json` gains a contract that lets `ItemTitle` take a font weight; without it `@shadcn/lint` refuses both classes.
- Tools' tool names under a source are regular weight; off tools still recede to the muted colour.
- DESIGN.md › Components, Lists and Tool rows say so; the `ListItem` comment too.

| Check | Result |
|---|---|
| RED/GREEN | 2 browser tests (MCP's `docs` and `search` rows 400, `docs` 500 once chosen; `visible_tool` 400 under its source) failed at 500, then passed |
| `bun test` | 380 passed (51 files) |
| `bun run typecheck` / `bun run lint` | Passed; with the previous `.oxlintrc.json` lint reports `font-normal` and `group-aria-pressed/item:font-medium` on `<ItemTitle>` |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 165 passed |

Manual (agent-browser at 1280px and 390px, dark, this branch on port 4370 with the real agent folder, `PI_OFFLINE=1`): Context for pi-settings-studio reads "System prompt" 600, "Base prompt" (chosen) 500, "Tool list" and "Rules" 400; Tools › Core tools shows `read` to `write` at regular weight under the On demand label. Console clean.

Not changed: other lists of Items with a description and actions (packages, folders, a server's tools, model patterns) keep Item's medium title, which sets it apart from the description under it.

---

# Verification — every tab checked for levels that read alike, 2026-10-10

Scope: after the list group labels, every tab at 1280×900 and 390×844 (dark; Tools also light) with an item chosen, and a census of the size, weight, colour and family of every visible text per tab. Three more places read alike:

- Every h3 was body size (14px semibold) beside 14px medium labels and row names: Advanced in General, Models in a provider, In settings.json in Packages. h3 takes a 16px title step (`--text-title`).
- In Tools, a source's name (13px semibold) sat over 13px tool names and under a 14px part heading. It takes the list group label: caption size, semibold, muted.
- Ghost buttons with only a word looked like the text beside them until hovered, and a touch screen never hovers: Use default beside "Pi's default is ask", Disable beside "Default", Filters and Update beside Remove. They are outline; a folder's Remove is destructive like every other Remove. Ghost stays for icon buttons and buttons an icon leads.

| Check | Result |
|---|---|
| RED/GREEN | The scale test failed without a title step; a browser test (Advanced larger than Session directory's label) failed at 14px against 14px; a browser test (`tools.ts` smaller than `visible_tool` and in another colour) failed at 13px against 13px; a source test listed the 11 ghost buttons with words. Each then passed |
| `bun test` | 380 passed (51 files). Once, while the suite ran beside the browser checks, tools-api's "a change to what Pi reads … inspects again" hit its 5 s timeout; alone it passed twice |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 163 passed |

Manual (agent-browser, this branch on port 4370 with the real agent folder, `PI_OFFLINE=1`): at 390px dark, Advanced and Models read above their rows; Tools › What the model doesn't see goes On demand (16px) › Core tools (12px, muted) › `read` (13px mono); Disable, Filters, Update, Update all and Use as default show borders, and Use default has a 1px border. Console clean.

Not changed: a group's switch in the Skills and Plugins lists looks like its rows' switches; ghost buttons an icon leads (View mcp.log, a Disclosure, the way back) stay ghost.

---

# Verification — a list group's name reads as a label, 2026-10-10

Scope: on a phone, Context's group names (System prompt, Tool declarations) could not be told from the rows under them: both were 14px in the body colour, the name semibold and the row medium (`ItemTitle`). Every workbench list shares `.list-header h2`. shadcn's `SidebarGroupLabel` (registry, base-nova: `text-xs font-medium text-sidebar-foreground/70`) and Primer's ActionList `GroupHeading` (`--text-body-size-small`, 0.75rem, semibold, `--fgColor-muted`, no text-transform) draw a group's name as a smaller, muted label in sentence case above 14px rows.

- `.list-header h2` takes the caption size and the muted colour. DESIGN.md › Lists and › Typography say so; two comments that called rows regular weight are fixed.

| Check | Result |
|---|---|
| RED/GREEN | 1 browser test (MCP's Global over its `docs` row: smaller, another colour, not in capitals) failed at 14px against 14px, then passed |
| `bun test` | 379 passed (51 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 161 passed |

Manual (agent-browser at 390px, dark, this branch on port 4370 with the real agent folder, `PI_OFFLINE=1`): Context for pi-settings-studio shows "System prompt" at 12px, 600, rgb(159, 157, 150) above "Base prompt" at 14px, 500, rgb(206, 205, 195). Console clean.

---

# Verification — a recorded first request counts what the model got, 2026-10-10

Scope: on a phone, Context › Recorded session listed 90 declarations under Tool declarations and said Pi recorded ≈ 35.4k tokens for a code mode only session whose model got ≈ 9.8k; the caveat sat in a note above the list, gone after one scroll. Pi records every declared tool and hides the direct ones from requests (`prepareCodemodeLoadout`), and the session file does not record which. The prompt's tool list does: Pi names each declared tool with a snippet that it did not hide, and its own tools always have one (`create*ToolDefinition`, public).

- `sessions.ts` splits the first request's declarations: with code mode declared and a Pi tool missing from the tool list, those the list does not name are `leftOut`, and `tokens` counts the prompt and the rest. With code mode and no list of Pi's tools (SYSTEM.md, or none declared), `leftOutUnknown`.
- Context says "The model got ≈ …", lists left-out declarations in their own group outside every total, each detail saying why, and warns when it cannot tell.

| Check | Result |
|---|---|
| RED/GREEN | 4 session API tests failed (no `PI_OWN_TOOLS`, `leftOut`, `leftOutUnknown`), then passed; one checks Pi's own tools against Pi's public definitions, so a Pi update that drops a snippet fails it. 3 browser tests failed (no "The model got", no "cannot tell", `read` gone), then passed |
| `bun test` | 379 passed (51 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 160 passed |

Manual (agent-browser at 390px, dark, this branch on port 4370 with the real agent folder, `PI_OFFLINE=1`): the newest pi-settings-studio session reads "The model got ≈ 9.8k tokens … 6.3k tokens of system prompt and 3.4k tokens in 1 tool declaration. Pi also recorded 89 declarations (≈ 25.6k tokens) that code mode only left out of every request." Tool declarations holds `codemode` alone; `read` under Left out of requests explains why. The same numbers as a count straight from the session file. Console clean. The real `~/.pi` was not written.

Not changed: later changes list the tools they add as recorded (a reload that re-declares direct tools under code mode only is not split). An extension's model-only tool without a snippet would be counted as left out.

---

# Verification — Context replaces System prompt: what a session puts in front of the model, 2026-10-10

Scope: System prompt listed 90 tools for a session whose model was given one. It replayed every system message to the end, so tools `tool_search` loaded mid-session looked as if they came with the first request (session `11-20-22`: 92 at the start, 8 `docs_mcp_server` tools later), and it showed what Pi recorded, while with `codemode.mode: "only"` Pi leaves its direct tools out of every request (`hiddenDeclarations`, Pi 1.1.0 `dist/extensions/codemode/tool.js`, `agent-session.js` `_installHiddenDeclarationsProjection`): the prompt's own `<tools>` section named `codemode` alone. What the model gets was spread over Tools, Instructions, Skills, MCP and System prompt, in characters or counts, never tokens. Claude Code's `/context` answers the same question in one place, by category, with each part's source (code.claude.com/docs/en/debug-your-config, /context-window).

- Context (`ContextTab.tsx`) answers it per project. Next session: the tool inspection now also builds the first request's system message as Pi does when a turn starts (skills and context files loaded, Pi's built-in `before_agent_start` handlers run, Pi's `buildSystemPromptState`, declarations minus hidden ones), each part with Pi's `estimateTokens`, its file and the tab that changes it. Code mode's declaration names the tools its description lists and the ones scripts find. Extensions' own turn-start handlers are named, not run. Recorded session: the first request as recorded, then each later change; with code mode in it, a note that the file records declarations Pi leaves out of requests.
- `#system-prompt` opens Context. The Tools overview counts one tool as "1 tool".

| Check | Result |
|---|---|
| RED/GREEN | 3 session API tests (no `start`/`changes`), 6 tool API tests (no `context`), 5 unit tests (no `prompt-parts.ts`), 6 browser tests (no Context tab) and 1 Tools overview test ("1 tools") failed, then passed |
| `bun test` | 373 passed (51 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 159 passed: `context.spec.ts` replaces `system-prompt.spec.ts` |

Manual (agent-browser, this branch on port 4370 with the real agent folder, `PI_OFFLINE=1`): pi-settings-studio's next session is ≈ 9.3k tokens: 6.3k of prompt and one 3k declaration, `codemode`, whose description lists 9 tools (`read`, `bash`, `edit`, `write` among them) while scripts find 16 more. Against the newest recorded session, six of eight sections matched byte for byte; `docs` names the app's copy of Pi's docs, and T3 Code's sessions list the same skills in name order (see docs/plugin-tools.md). Recorded session `11:36` shows "8 tools added" as a later change. Light at 1440px, dark at 390px; console clean. Screenshots: `docs/evidence/context-desktop.png`, `context-mobile-dark.png`. The real `~/.pi` was not written.

Review against Vercel's Web Interface Guidelines (fetched today): list states now use tabular figures, as DESIGN.md asks of counts, and tool and extension names in Context are `translate="no"`; `context.spec.ts` and `tools.spec.ts` passed again (22).

Not changed: an extension's `before_agent_start` handlers and a request's `context` handlers are not run, and tools a host adds (T3 Code's) are not seen. A recorded session cannot say which declarations were hidden.

---

# Verification — two flaky browser tests, 2026-10-10

Scope: `package-updates.spec.ts:44` and `motion.spec.ts:73` failed now and then. Both were the tests, not the app.

- Packages: the region holds the settings form, whose loading spinner is shadcn's `Spinner` (`role="status"`). When the form was still loading, `region.getByRole("status")` matched two elements, a strict-mode violation. Every status check in the spec now picks the status that says its text (`packageStatus`), as `plugin-tools`, `tools` and `system-prompt` already do.
- Menu: Base UI's `useClick` reads `open` on mousedown but applies it on the next animation frame. Two raw clicks in one frame both saw the menu closed, so it stayed open. The test waits one frame between them, inside the 100ms entrance.

| Check | Result |
|---|---|
| RED/GREEN | A temporary spec (deleted) failed 3 of 3 with the old locator while `/api/settings/**` was held, and with two presses in one task; the new locator and a frame between presses passed 3 of 3 |
| Stress | `package-updates.spec.ts` and `motion.spec.ts` with `--repeat-each=25`: 250 passed |
| `bun test` | 361 passed |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run test:e2e` | 154 passed |

# Verification — the app over the tailnet, 2026-10-10

Scope: a phone on the tailnet opens the app. Before, only `127.0.0.1` and `localhost` passed the Host and Origin allowlist.

- `--allow-origin URL` (repeatable) in `cli.ts` and `startServer({ allowedOrigins })`. `parseAllowedOrigin` keeps only an http or https origin with no path. Nothing is allowed by default.
- The installed service has a drop-in at `~/.config/systemd/user/pi-settings-studio.service.d/tailnet.conf` (outside the repo) with `--allow-origin https://anphat-1.taild3d41b.ts.net:4369`. `tailscale serve --bg --https=4369 http://127.0.0.1:4369` serves it on the tailnet only. The existing 443 route to 127.0.0.1:3773 was not changed.

| Check | Result |
|---|---|
| RED/GREEN | `tests/server.test.ts` failed with "Export named 'parseAllowedOrigin' not found", then passed (3 of 3) |
| `bun test` | 361 passed (50 files): 2 new |
| `bun run typecheck` / `bun run lint` / `bun run build` | Passed |
| `bun run test:e2e` | Run 1: 153 passed, 1 failed (`package-updates.spec.ts:44`, a strict-mode locator that matched 2 status elements; it passed alone 2 of 2). Run 2: 153 passed, 1 failed (`motion.spec.ts:73`, the flake recorded below) |
| Live, from this machine on `https://anphat-1.taild3d41b.ts.net:4369` | GET 200; POST from its own origin 415 (origin accepted, nothing written); POST from `https://evil.example` 403; localhost 200; the 443 route 200. The phone itself was not tested |

# Verification — update checks in the background, a newer Pi, and each MCP server's state on open, 2026-10-10

Scope: three reads still waited for a click. Package updates were found only by Check for updates and forgotten on restart; Update Pi did not say whether a newer Pi existed; MCP did not say which servers connected without Test connections. Leaders do these on their own: VS Code checks extension updates when the window loads, then every 12 hours (microsoft/vscode `extensionsWorkbenchService.ts`, issue #158022); update-notifier checks in the background once a day, persists the result and skips in CI and tests (sindresorhus/update-notifier README); `claude mcp list` prints each server's health (code.claude.com/docs/en/mcp); Pi itself checks for a new Pi and package updates at startup unless `PI_OFFLINE` (Pi 1.1.0 `interactive-mode.js`).

- Update checks run with `checkUpdates`, which the app turns on in `cli.ts`; tests turn it on only where they test it. Results are kept in `pi-settings-cache.json` beside Pi's files.
- Packages: listing Plugins starts Pi's `checkForAvailableUpdates` when the last check for these settings is missing or a day old, not with `PI_OFFLINE`, not in an untrusted project, and a failed one not again within the hour. The last result stays shown while a new one runs. Package jobs forget kept results too. The Plugins tab counts the updates ("Plugins, 1 update"). The comment "listing never starts a check" is gone.
- Pi: `/api/pi` adds `latest` from `npm view @earendil-works/pi-coding-agent version` (the user's npm config applies, as for Pi's own package checks), once a day, skipped with `PI_OFFLINE` or `PI_SKIP_VERSION_CHECK`; a slow registry holds the page at most 3 s.
- MCP: `/api/mcp/status` runs `pi mcp list --json`, kept like a tool inspection while the MCP and credential files are unchanged. Rows show connected, needs sign-in or failed; the detail says it beside the name and why a server failed; tools are listed by their names on the server. Test connections stays as the job with Pi's full output and refreshes the report. The probe's `mcpTool`, read from Pi's internal label, is removed.

| Check | Result |
|---|---|
| RED/GREEN | New API tests failed (no `latest`; no export or no automatic check; 404 for `/api/mcp/status`), then passed. New browser tests failed with the old client ("Pi1.1.0"; tab named "Plugins"; row "echo-server Code mode"), then passed |
| `bun test` | 359 passed (50 files): 7 new, 1 removed with `mcpTool` |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 150 tests: 148 passed in the full run. `mcp.spec.ts:210` passed on its own. `motion.spec.ts:73` (two clicks inside a 100 ms menu entrance) fails now and then before this change too: 1 of 10 at `591c1c7`, 2 of 10 now |

Manual (T3 preview, a temporary agent folder with `echo` (a tool named `say-it.v2`), `dead` (a missing command), `off-echo` (off), an old npm package and a loopback registry whose latest is 999.0.0; the old build from a worktree at `591c1c7`, then this one): before, the list showed "Code mode" for `echo` and `dead`, the Plugins tab no count, General › Pi only "Pi 1.1.0 is installed". After, with no click: `echo` ✔ Code mode with "Connected · 1 tool" and `say-it.v2`; `dead` ✘ failed, "Failed" and "Pi could not connect: spawn definitely-not-a-command-xyz ENOENT"; "Plugins 1"; Packages "1 package update found" and Update available; Pi "1.1.0 · 999.0.0 available". After a restart the same "Last checked" time showed and no check was sent. Console clean. The real `~/.pi` was not written.

Not changed: the first Pi lookup of a day can leave the Pi panel empty for up to 3 s. A server that needs sign-in is shown from Pi's report but was not exercised with a real OAuth server. Test connections still runs a second `pi mcp list` beside the kept report.

---

# Verification — an MCP server's tools list when it is opened, 2026-10-10

Scope: MCP listed a server's tools for per-tool exposure only after Test connections (`pi mcp list`), while opening Tools already starts the same servers through the tool inspection. Opening a server now reads that inspection with `useCached` under the key Tools uses, so one result serves both tabs. Each MCP tool in the inspection carries `mcpTool`, its name on the server: `toolExposure` rules match that name, and Pi's tool name keeps only `[A-Za-z0-9_]` (Pi 1.1.0 `dist/extensions/mcp/tools.js`, `createMcpToolName`); the probe reads it from Pi's `<server>/<tool>` label. Saves that may change which tools servers offer (switches, add, edit, remove, undo, import, raw JSON) ask again; exposure changes do not. Test connections stays as the diagnostic. The comment that made running servers explicit, and the browser test that required a connection test first, are replaced. AGENTS.md now states the rule: a view loads what it shows when it opens.

| Check | Result |
|---|---|
| RED/GREEN | 1 new API test failed (`mcpTool` undefined), then passed; 3 new browser tests failed (no tool list, "Test connections to list"), then passed |
| `bun test` | 353 passed (49 files), 1 new |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 148 passed: 3 new, 1 replaced. MCP specs whose fixtures name `npx` commands and remote URLs answer `/api/tools` with no tools, so opening a server never runs them |

Manual (T3 preview, a temporary agent folder with an `echo` server and an `off-echo` server turned off): before, opening `echo` showed "Test connections to list this server's tools" and no tools; after, it lists `echo` with "Inherit: Code mode" with no click. `off-echo` says "Turn the server on to list its tools."; turning it on shows "Checking for changes…", then its `echo` tool. Console clean. The real `~/.pi` was not written.

Not changed: a server that is off has no tools to list, since Pi does not start it. With a project chosen, a global server that the project replaces with its own shows the project server's tools. `mcpTool` depends on Pi's label format; `tests/tools-api.test.ts` fails if a Pi update changes it.

---

# Verification — each settings.json key edited in the one tab that owns it, 2026-10-10

Scope: General repeated four tabs. Its Tools group held only Startup tools, while the Tools tab said "Read-only" and sent the reader to General to change Pi's own tools; its Models & thinking group and Models › Defaults linked back and forth; Skill commands sat in Messages & interaction and the npm command in "Shell & packages". SPEC.md already gave General only the keys no other tab owns. Each key now lives in its owner, with General's own rows (`SettingsForm.tsx`: the draft, rows and save bar moved out of `GeneralTab.tsx` unchanged): Startup tools pinned in Tools (`#tools/startup`, followed also from links inside the tab, and a save refreshes the views), prompt caching and thinking budgets under Models › Defaults and saved with Save defaults, Skill commands pinned in Skills, the npm command at the end of Plugins › Packages. General lists seven groups: Messages & interaction, Sessions & context, Shell, Images, Updates, Network, Terminal UI. Found on the way: a turned-off built-in extension (llama.cpp, tool search) said "Turn on in General", which has no such switch; it now says Plugins. A review against Vercel's Web Interface Guidelines (fetched 2026-10-10) found the moved rows no longer warned before the page was left; the beforeunload warning moved from General into the shared draft.

| Check | Result |
|---|---|
| RED/GREEN | 10 new browser tests failed first (missing field, pane or entry; General still listing the group; the link to General; no beforeunload dialog), then passed. Tests that used General's moved groups now use the groups that stay |
| `bun test` | 352 passed (49 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 150 passed; axe on the Tools, Skills and Plugins pages and the Defaults form passes |
| Impeccable detector | No findings on the changed components |

Manual (T3 preview, a temporary agent folder; the real `~/.pi` was not written): at 1440×900 General lists its seven groups; Skills › Skill commands, Plugins › Packages with the npm command below a hairline, and Models › Defaults with the rows under the defaults and Save defaults sticky. At 390 px in dark, `#tools/startup` opens the checklist in place of the list with "All views", the save bar sticky and no horizontal scroll. With `defaultTools: "read"` (not a list) the inspection still completes, so Startup tools stays reachable to repair it, as MCP › Code mode's error now says.

Not changed: Startup tools appears once the tool inspection has answered; a single-setting pane repeats its setting's name as its heading.

---

# Verification — Code mode in startup tools is a state with a link to MCP › Code mode, 2026-10-10

Scope: General › Startup tools had a `codemode` checkbox that wrote the same `defaultTools` entry as MCP › Code mode's "When Code mode is on". Unticked read as off, but Pi turns `codemode` on when an MCP server with codemode exposure connects (pi.dev docs: MCP, Control tool exposure), and the checkbox did not say that `codemode.mode` (built-in tools direct or only from scripts) lives in MCP › Code mode. Android's settings guidelines (source.android.com: Settings design guidelines) keep a setting shown in two places on one screen with entry points from the others. The row now states Always on or Automatic, with the change note the other rows have, and links to `#mcp/codemode`; the MCP tab opens on Code mode from that hash, as General and Models do for theirs, and keeps it chosen when the project changes.

| Check | Result |
|---|---|
| RED/GREEN | 2 new browser tests failed (a `codemode` checkbox: expected 0, received 1; no link), then passed |
| `bun test` | 352 passed (49 files), unchanged |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 146 passed (2 new); axe on `#row-defaultTools` passes |

Manual (T3 preview, a temporary agent folder with `defaultTools: ["+tool_search"]` and `codemode.mode: "only"`): at 1280×800 the row shows Automatic and the link, its icon in line with the checkboxes; the link opens MCP › Code mode with Automatic and In scripts chosen; at 390 px the link opens the panel in place of the list, with no horizontal scroll. Console clean. The real `~/.pi` was not written.

Not changed: the row does not know about `-builtin:codemode` in `extensions` (MCP › Code mode says so); in a project the link opens Code mode on the global scope.

---

# Verification — hovered and highlighted rows in dark menus, selects and comboboxes, 2026-10-10

Scope: in dark, `--popover`, `--accent` and `--muted` were all Flexoki's base-900, so the row Base UI highlights under the pointer or the arrow keys in every Select, DropdownMenu and Combobox drew nothing (`--accent` alone marks it), nor did a toast's ghost close button on hover or an AlertDialog's footer (`--muted`). Base UI did its part: the row had `data-highlighted` and focus (docs-mcp `base-ui`: Select, `highlightItemOnHover` defaults to true). Dark `--popover` moves to bg-2 (base-950), the card colour, as shadcn's default dark theme puts floating layers on its card colour with `--accent` one step above (docs-mcp `shadcn-ui`: Theming). Light is unchanged. Moving `--accent` to ui-2 instead would have left `--muted` on popovers and given hover the chosen row's colour.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 347 passed (48 files). New: in both schemes, `--accent` differs from `--popover`, and `--muted` from `--background`, `--sidebar`, `--card` and `--popover` |
| RED/GREEN | 2 failed (dark `--accent` and `--muted` on `--popover`, both #282726), then passed |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 142 passed, unchanged |

Measured with Playwright (`hover: hover` matches) on a temporary agent folder, 1280×800: the background a reader sees (each layer composited over the ones beneath), at rest and hovered or highlighted, as a WCAG luminance ratio.
- Dark, before → after: rows of the Project and Thinking level selects, the File and `…` menus and the Default provider list 1:1 → 1.153:1, the step a hovered list row already takes (1.153:1); an AlertDialog's footer 1:1 → 1.07:1.
- Light: unchanged, rows 1.241:1.

Found, not changed:
- Light: shadcn's SelectTrigger has no hover fill (only `dark:hover:bg-input/50`), and `shadcn add select --dry-run --diff` shows the file as the registry ships it; the pointer cursor is its hover sign.
- Dark: a ghost button inside an InputGroup (the Combobox's "Show suggestions" chevron) turns darker on hover, 1.031:1: `dark:bg-input/30` is lighter than `dark:hover:bg-muted/50` because dark `--input` is base-600 for a 3:1 boundary. No token fixes it without moving `--muted` (the list rows' hover) or `--input` (control borders).
- Dark: ghost icon buttons on the list pane (`+`, `…`) hover at 1.07:1, shadcn's `dark:hover:bg-muted/50` over bg-2.

Manual: before, the running service, hover only, nothing chosen (T3 preview, then `agent-browser` in its own session after the preview host disconnected): a highlighted row #282726 on a #282726 popup in the Project select, the File menu and the Default provider list. After, screenshots of each open list in both schemes: the hovered row shows; menus over the list pane keep shadcn's ring and shadow. The real `~/.pi` was not written.

---

# Verification — providers that extensions register, in Defaults, 2026-10-10

Scope: the Default provider list put claude-bridge last, under 39 providers that are not set up, labelled "From Enabled models": Pi's catalog as this app reads it has no provider an extension adds, so Defaults guessed at them from `enabledModels`. Measured first on the real `~/.pi/agent` (read-only, as the Tools tab's probe already runs it): after Pi's extension loader, `claude-bridge` (pi-claude-bridge 0.9.2, 14 models, Pi's status configured, source fallback), `antigravity-acp` (4 models, not set up) and the built-in `llama.cpp` (none) are queued providers; a probe takes about 1.4 s. Pi 1.1.0 applies queued providers in `runner.js` bindCore, through `agent-session.js` to the session's ModelRuntime. Starting a session would choose a model, which may run a credential command, so the probe applies the queue itself on a runtime over a read-only copy of auth.json.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 342 passed (49 files), up from 337: an extension's providers listed with Pi's status and model count (not Pi's own or models.json ones), a set-up one's models available, listed with their thinking levels and counted by a pattern while one that needs a sign-in is "no-credential" and an unknown name "unknown-provider", a failing extension named with the catalog still answering, a project's extension only in that project, and no credential command run and no session started |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run test:e2e` | 143 of 144 passed; the one failure, motion.spec's pointer menu closing mid-entrance, passed 3 of 3 alone (load average 3.8; it does not open Models). New: an extension's provider chosen in Defaults (Set up, its models and their thinking levels, its checklist group, a pattern counting 2 models, saved, axe), a name only Enabled models gives listed between Set up and Not set up. Changed: the warning for a name nothing has, and the empty list's text |
| RED/GREEN | The order test failed on "Not set up" second; the five API tests failed on 404 and a missing model, also with the server code stashed; the three Defaults tests failed on the old warning, the old empty text and a missing provider |

Found:
- The suggestion field stayed closed when asked to open before its suggestions arrived, since an open request was dropped while the list was empty; with available models now waiting for the probe, per-model thinking timed out on it. The field keeps the request and opens when they arrive, while it has focus.
- In the real `~/.pi`, `auth.json` no longer had an Anthropic credential (changed at 06:15, before this work ran); the running service and this branch both show Anthropic as not set up.

Decisions:
- Extension providers join the suggestions, the available models, the scope and a provider's model list, but not the provider list on the left: its sign-in and key actions run Pi's login on the catalog runtime, without extensions.
- An extension that fails to load is an issue in a kept result (it fails again until its file changes, which changes the stamp); a probe that fails as a whole gives no providers and is tried again. The warning under the field says the name cannot be checked when an extension could not be read, and that Pi has no such provider only once all were read.

Manual: this branch on port 4381 over the real `~/.pi/agent`, `agent-browser` in its own session, 1280×800 dark, navigation only: claude-bridge under Set up, its 14 models in Default model, no warning, `claude-bridge/*` matching 14 models; no console errors. settings.json, auth.json and models.json kept their times.

---

# Verification — suggested free text in a list like the selects, 2026-10-09

Scope: the five free-text fields with suggestions (Default provider and model, the Enabled models pattern, the model rows of the per-model maps in Defaults and General, an MCP server's Pi provider) leave the browser's `datalist`, whose list the browser draws outside the page and its styles, for `SuggestInput`: shadcn's Combobox, added with `shadcn add combobox` and unchanged, on Base UI's Autocomplete root. In Base UI 1.8.0 every Autocomplete part but the root is the Combobox part (`autocomplete/index.parts`), and the root is the Combobox root with `selectionMode: "none"`, so the shipped parts keep whatever is typed. A click lists every suggestion, as the selects do; typing narrows by ID or name; providers are grouped Set up, then Not set up; each suggestion shows its name beside its ID. This replaces the datalist kept in the two entries below that name it (docs-mcp `base-ui`: Autocomplete, Combobox; `shadcn-ui`: Combobox; `shadcn search`: no autocomplete in @shadcn; @coss/autocomplete brings its own input and scroll area).

| Check | Result |
|---|---|
| `shadcn add combobox --dry-run --diff` | No changed line |
| `bun test` (`HOME` an empty folder) | 337 passed (48 files), unchanged |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` | 142 passed. New: the default provider list (below its field, Set up first, a choice fills the ID, opened again it lists every provider, typing narrows, a name it lacks is kept with a note, axe), an Enabled models pattern picked with the arrow keys (Enter fills the highlighted suggestion, Enter again adds it). Rewritten to pick from the list: defaults saved from the catalog, a default outside Enabled models, per-model thinking, an MCP server's Pi provider |
| RED/GREEN | 6 failed on the datalist client (no listbox; Enter added the typed text), then passed |

Found:
- While the list is open, Base UI's focus manager hides the rest of the page from assistive technology (`ComboboxPopup` manages focus modally when the input is outside the popup). Tests that go on to another control press Tab first, as a keyboard reader would. Escape closes the list; a second Escape, with the list closed, clears the field (Base UI's input).
- Base UI names the trigger from its own Field or Combobox label; shadcn's FieldLabel is a plain label, so ComboboxInput's trigger had no name (axe button-name, critical). `SuggestInput` builds ComboboxInput's row from the same parts with an `aria-label`. ComboboxInput's `data-pressed:bg-transparent` is not repeated: `@shadcn/lint` no-restyle refuses it outside `components/ui`, so the open trigger keeps the ghost button's pressed shade.
- Base UI fixes a controlled or uncontrolled `open` on the first render: fields whose suggestions arrive later stayed closed until `open` was always controlled.
- General focused an invalid field through `[data-slot=input]`; an InputGroup's input is `input-group-control`.

Manual: `agent-browser` in its own session on a temporary agent folder, 1280×800 dark, after the T3 preview host disconnected: the provider list, a provider's models next to the Thinking level select, a pattern narrowed to Haiku; no console errors. Before: the running service in light, navigation only, nothing saved: the datalist's arrow (its list is drawn outside the page and is not in a screenshot). The real `~/.pi` was not written.

---

# Verification — General as a workbench, with each setting's real default, 2026-10-09

Scope: General's layout and what its rows say, chosen from a variant round (Rows, Panels, Sheet in a throwaway Vite harness on the real data, read-only; Rows chosen, harness deleted). The list holds Pi, the nine groups, Keyboard shortcuts and Not editable here; the detail shows one group, its advanced rows under their own heading. Every row says Default or Custom; Use default only where the value differs. Defaults the control cannot show are named: Pi's own `getShellConfig` and `SettingsManager` resolve the shell and external editor on the server, the session folder follows the agent folder, the provider timeout follows the HTTP idle timeout, thinking budgets carry pi-ai's `DEFAULT_THINKING_BUDGETS`. Saving follows VS Code (`settingsEditor2.ts` `updateChangedSetting`): in the global file a value equal to Pi's default removes the key; a project file keeps it; untouched keys stay, even when they repeat a default.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 321 passed (46 files), up from 298: `isPiDefault` (absent, equal, empty text, lists and maps as Pi reads them, startup tools, refused values), `fileChange` (global default removes or writes nothing, project keeps it, refused values kept for Save to point at), `defaultText` (switches, grouped numbers, spaces, machine defaults, the provider timeout following the idle timeout, no field left without one); the settings view's machine defaults and the editor's variable |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; the >500 kB chunk warning remains |
| `bun run test:e2e` (same `HOME`) | 129 passed, 1 failed: projects.spec's General step looked for HTTP proxy without choosing its group. Adapted, projects.spec passed 6 of 6. New: choosing a group, narrow list-then-group with a way back, per-group counts of custom settings, advanced rows under their heading, a default row naming /bin/bash with nothing to reset, choosing a default removes the key while a default already in the file stays, Save reaching a refused value in another group |
| RED/GREEN | Unit: the new tests failed on missing exports and a missing `defaults`, then passed; an unescaped `${}` in `words` was caught by a test that failed with it and passed without. Browser: 29 of 43 failed on the old client (no group list), then all passed. Two motion tests failed in RED for the wrong reason (the OAuth Disclosure needs the URL transport) and were fixed before GREEN; three sound tests and the theme test needed their group, and the theme test now waits for the first list to close |
| Manual preview | Running service on the real `~/.pi`, navigation only, nothing saved: 1280×800 dark and 390 px: Messages (Skill commands at its default though the file sets it), Shell (Default: /bin/bash · found on this machine), Network, Not editable here; no horizontal overflow, no console errors or warnings |
| Impeccable detector | No findings on GeneralTab.tsx, SettingField.tsx, NotHere.tsx and styles.css |

Limits: the external editor's default is resolved in this app's environment (a systemd service); a terminal where `$VISUAL` or `$EDITOR` is set gives Pi another one, and the row says so. The budgets apply to models that think within a token budget; Gemini 2.5 models have their own. Not verified: a real screen reader, forced colors, Windows.

---

# Verification — leaving a tab mid-work, 2026-10-09

Scope: what happens when the reader leaves a tab, reloads, or changes selection while something slow runs. Measured first on a temporary folder with an MCP server that answers in 3 s: a Tools inspection cancelled after 1 s was killed on the server, and returning took the full 3.4 s again; Plugins' extension tools the same. A job (here Test connections) ran on, but its panel was gone on return. Session listings already finished on the server. Fixed: inspections (A), job panels (B), the package check's state (C).

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 298 passed (45 files), up from 290: `Inspections` (a request that leaves does not stop the run, the next joins it; three idle runs at most, oldest stopped first; a waited-for run is never stopped; changed files or fresh start anew without a stale overwrite; incomplete not kept), an early-leaving `/api/tools` request starts the MCP server once, a repeated job request returns the running job and `GET /api/jobs` lists it without output, a running package check shows in `/api/plugins` and a second request joins it |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run build` | Passed. JS 865.8 kB (gzip 263.7 kB); the >500 kB chunk warning remains |
| `bun run test:e2e` (same `HOME`) | 128 passed. New: leaving Tools during its first load and returning starts the MCP server once; Test connections keeps its panel across leaving, a reload and leaving again until dismissed, its button disabled while it runs; a sign-in waiting for an answer still asks it after leaving Models; leaving Plugins during a package check and returning shows it checking, then the result |
| Manual timing | Tools opened, General after 1 s, back to Tools: the list after 4.0 s in all, 1.3 s after coming back, one MCP server start (before: 2.9 s more after coming back, two starts) |

RED/GREEN: each new test failed first for its reason (two server starts; a second job id; no `updateChecking`; no panel or question after returning; "Not checked yet"), then passed. The browser tests for A and B were also run against the old server and client code, where they fail.

Decisions:
- A request's abort now means "stop waiting", not "stop the work": the browser still cancels its fetch on leaving, and the server decides. Idle runs are bounded (three, 30 s each), so clicking through many extensions does not pile up processes.
- Jobs match the request that started them exactly (action, project, server, source, provider). A panel shows a job in its scope that still runs, or one this page showed and the reader has not dismissed; after a reload only running ones come back.
- `GET /api/jobs` returns summaries; the panel loads the one job it needs, so output does not travel on every tab change.
- Fixtures write `auth.json` as an agent folder in use has one: Pi creates it on its first run, which changes the files an inspection is keyed on.

Manual: `agent-browser` in its own session on a temporary agent folder; the real `~/.pi` was not written.

---

# Verification — slow tabs keep their last result, 2026-10-09

Scope: every load measured on a real agent folder (read-only GETs; 100 session files, 166 MB) and the two tool inspections. Slow: `/api/sessions` about 0.9 s on every visit to System prompt and again to open a session; Tools and an extension's tools start Pi, every extension and every MCP server each time. Every other GET answered in under 0.1 s and is unchanged.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 290 passed (44 files), up from 285: a second inspection reuses the kept result; a settings, extension-file or `mcp.json` change, or `fresh`, inspects again; an incomplete one is not kept; an extension's inspection likewise; a changed or new session file shows in the next listing |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run build` | Passed. JS 865.1 kB (gzip 263.4 kB) with the new sounds from main; the >500 kB chunk warning remains |
| `bun run test:e2e` (same `HOME`) | 124 passed. New: returning to Tools, to an extension in Plugins and to System prompt shows the last result while the next request is held (`page.route`), with "Checking for changes…"; Refresh tools sends `fresh: true` |
| Timing | `/api/sessions` 0.92 s, then 0.016 s while no session file changes; opening a session 0.04 s. Tools on a temporary folder with one MCP server: 587 ms, then 25 ms after a reload; on returning to the tab the list shows at once |

RED/GREEN: the inspection tests failed on the missing reuse and the unknown `fresh` field, the three browser tests on the spinner shown while the request was held, then passed. The session listing is a speed change with no new behaviour: its test passed before the change, still passes, and fails with the folder stamp held constant.

Decisions:
- The cache key is what Pi reads, not a timer alone: settings and `mcp.json` revisions (both scopes), `auth.json`, the mtime of `mcp-auth.json` and of each enabled extension file, plus a ten-minute limit for what it cannot see (imported files, an MCP server's own tool list).
- Pi creates `auth.json` on its first run, so a folder without one misses once; the test fixtures write `{}` as a folder in use has.
- Session folders are stamped by their files' names, sizes and times; Pi's per-file reader is not exported, so a folder with one changed file is read again whole. Only the fields the app shows are kept, not every message's text.
- Results are in memory only: a service restart starts cold.

Manual: `agent-browser` in its own session on a temporary agent folder: Tools, then General, then Tools again showed the list at once; a reload answered from the kept inspection. The real `~/.pi` was read by the timing GETs only and not written.

---

# Verification — interaction sounds with cuelume, 2026-10-09

Scope: cuelume 0.2.4 (latest on npm; MIT; no dependencies, no install scripts; the published JavaScript makes no request, reads no storage and runs no eval) plays the app's sounds. `Sound.tsx` maps each clicked control to a cue by its ARIA role and state, plays outcomes from the toast, error Alerts, refused forms and jobs, and holds the Sounds Toggle in the top bar (on by default, stored in `localStorage`).

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 283 passed |
| `bun run typecheck` / `bun run lint` | Passed, no warnings; `@shadcn/lint` 0 findings |
| `bun run test:e2e` (same `HOME`) | 118 passed, 5 new: controls sound from pointer and keyboard and hovering stays silent; one action plays one cue, from a control or its label; the Sounds toggle silences the app, is remembered and says so when turned on; a save sounds when its answer arrives, landed or refused; a job sounds when it finishes |

Sounds are measured where they leave the app: each Web Audio source started. RED/GREEN: all five failed first (no sound, no toggle), then passed.

Found while building:
- `AudioBufferSourceNode` has its own `start()`; a spy on `AudioScheduledSourceNode.prototype.start` missed every noise-only cue, such as navigate.
- Base UI forwards a checkbox's or switch's click to its hidden input, which holds the id a label points to: one click played twice. The input now stands for the control beside it, and a control plays once per action; the one-cue test failed without that guard (6 sources instead of 3).
- Select, menu and disclosure triggers still read `aria-expanded="false"` in the click's capture phase, and a tab `aria-selected="false"`, so the click alone tells opening from closing.

Manual (`agent-browser`, own session): the Sounds Toggle at 1280×800 light (tooltip "Sounds") and 390 px dark (off, remembered after reload); no horizontal overflow, no page errors.

Not verified by ear in this environment: the cues are checked as started Web Audio sources, not listened to.

---

# Verification — ScrollArea scrollbars under the app's CSP, 2026-10-09

Found while adding sounds: Base UI hides a ScrollArea viewport's native scrollbar with a `<style>` element it injects, and the app's Content-Security-Policy (`style-src 'self'`) blocks it. Where scrollbars are classic, as in Chrome and Edge on Windows, every pane showed a 15 px native scrollbar, horizontal too, beside shadcn's thumb. Headless browsers draw overlay scrollbars, which hid it from the earlier checks.

Fix, as Base UI's CSP Provider docs describe: `<CSPProvider disableStyleElements>` around the app (`main.tsx`) and Base UI's `.base-ui-disable-scrollbar` rule in `styles.css`.

| Check | Result |
|---|---|
| New e2e | Every viewport has `scrollbar-width: none` and the page logs no CSP violation: failed first (`auto`), then passed |
| Manual (`agent-browser --hide-scrollbars false`, classic scrollbars) | Native scrollbar 15 px before, 0 px after |

---

# Verification — Tools as a workbench, 2026-10-09

Scope: the Tools tab rebuilt as the variant the user chose after two rounds behind a `?variant=` picker (round 1: Lanes, Sources, Ledger, Split, Focus; round 2 around Split: Pair, Trio, Overview; chosen: Pair). `/api/tools` adds `idleSources`. The harness and its branch were deleted.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 285 passed (44 files), up from 283: idle sources (turned off, on without tools, the MCP extension excluded) and a project `mcp.json` override that turns a global server off |
| `bun run typecheck` / `bun run lint` | Passed, no warnings; `@shadcn/lint` 0 findings |
| `bun run build` | Passed. JS 837.4 kB (gzip 256.0 kB), CSS 116.7 kB (gzip 19.1 kB); the >500 kB chunk warning remains |
| `bun run test:e2e` (same `HOME`) | 115 passed. `e2e/tools.spec.ts` rewritten for the workbench: the sees view by source beside every source and its state (axe), doesn't-see with on demand apart from folded off and links to turn sources on (axe), a source's reach tally, change link and opening row, search across the list and views, the project picker at 320px with the panes taking turns (axe), a failed inspection and Refresh tools |
| `impeccable detect` | 0 findings on the variants, run once per round |

RED/GREEN: the two API tests failed on the missing `idleSources`, and the six browser tests on the old tab, then passed.

Decisions:
- Built-in extensions (code mode, tool search, llama.cpp) are listed as built into Pi; the MCP extension's own tools stay under their servers, so it is never an idle source.
- On demand and off stay apart in "doesn't see": the model can still call on-demand tools. Off is folded with the sources that give no tools.
- MCP servers are ordered by name: they register as they connect, which changes between inspections.
- Not taken from the rounds: the overview sentence moving into the pinned view, and a full tally in every list row (the source's detail has it).

Manual: `agent-browser` in its own session on temporary agent folders (an extension with direct and code-mode tools, a turned-off and a tool-less extension, five fake MCP servers in direct, code-mode and deferred exposure, two turned off), 1280×900 and 320 px light: sees, doesn't see with off opened, an extension's detail, docs-mcp-server on a phone; no horizontal overflow, no page errors. Not checked: dark mode, 200% zoom. The real `~/.pi` was not written; the user looked at the variants with their own configuration on a separate server.

---

# Verification — selects drop below their field, 2026-10-09

Scope: every Select (21, all through `OptionSelect`) opened over its field, with the chosen option laid on the field and the list growing both ways (Base UI's `alignItemWithTrigger`, true by default). It now drops below the field, or above it when there is no room, like the menus.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 283 passed |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run test:e2e` (same `HOME`) | 113 passed. New: the Thinking level and API selects never cover their field, with the first or a later option chosen |

RED/GREEN: the new test failed on the first open (the list covered the Thinking level field), then passed with `alignItemWithTrigger={false}`.

Manual (preview, then `agent-browser` in its own session when the preview host disconnected), 1280×800 dark: API near the bottom of the pane opens above, Thinking level below, the project picker below; a menu's tooltip closes when the menu opens; the popup is opaque once its 100 ms fade-in ends.

Kept: the five free-text fields with suggestions use the browser's own datalist list. shadcn's registry has no autocomplete and its Combobox accepts only listed values.

---

# Verification — ScrollArea and the section index, 2026-10-09

Scope: seven boxes that scrolled with `overflow: auto` (the workbench's two panes, the mcp.log, a job's output, both prompt views, an endpoint's model list) now scroll in shadcn's ScrollArea (base-nova, added with the CLI); General's section index is drawn with `buttonVariants` on plain links. Left native on purpose: `main`, the page's one scroller, and the two strips that scroll sideways with a faded edge and no scrollbar (the tab bar, the narrow section index).

| Check | Result |
|---|---|
| `shadcn add <name> --dry-run --diff` | 28 of 28 unchanged |
| `bun test` (`HOME` an empty folder) | 277 passed |
| `bun run typecheck` / `bun run lint` | Passed, no warnings; `@shadcn/lint` 0 findings |
| `bun run test:e2e` (same `HOME`) | 108 passed, up from 104 |

Guards written first, passing on the native scrollers and still passing on ScrollArea: the provider list scrolls on its own with its search in view; a long form keeps its save row in view on a wide screen; on a narrow screen the page scrolls the form and its save row stays in view; a 300-line mcp.log stays within 32rem and scrolls from the keyboard.

Found:
- Base UI puts `overflow: scroll` on the viewport inline. On a narrow screen that would make an unscrolled pane the sticky save row's scroller, so there the ScrollArea's boxes are `display: contents` and the page scrolls (the narrow guard).
- `<Button render={<a />} nativeButton={false}>` gives the link `role="button"` (Base UI `useButton`); shadcn's Button docs say to use `buttonVariants` on `<a>` instead. The previous report recommended the wrong one.
- `buttonVariants` does not merge classes, so `justify-between` needs `cn`; the base link colour turned the index blue and now applies only to links without classes.
- The index's visually hidden counts had relied on a hand-written `position: relative` on each link; without it they widened the page at 390 px. The existing 320 px overflow check failed with the bug and passed with the fix (`.section-nav` is `position: relative`).
- A labelled region for the log's contents clashed with the region named mcp.log; it is a group.

Manual (`agent-browser`, own session): main and this branch side by side, 1280×800 light and 390 px dark: General's index (current group, counts, unsaved dot), the provider list, the mcp.log with its ScrollArea thumb. No horizontal overflow at 390 px on General, Models, MCP, Skills and Plugins.

---

# Verification — Tools tab, 2026-10-09

Scope: a Tools tab listing every tool a new session registers at startup, grouped by source (Pi built-in, each extension including built-in ones, each MCP server by its configured name) with how the model reaches it. `POST /api/tools` runs the existing tool probe without a selected extension; the extension tool list moved into a shared `ToolList`.

| Check | Result |
|---|---|
| `bun test` (`HOME` an empty folder) | 283 passed (44 files), up from 277: six for `POST /api/tools` (sources, reach, project settings, unknown project, MCP startup failure, credential masking). With the real home, the four skills tests still fail on main as on this branch (`~/.agents/skills/shadcn`) |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run build` | Passed. JS 812.1 kB (gzip 248.2 kB); the >500 kB chunk warning remains |
| `bun run test:e2e` (same `HOME`) | 108 passed, up from 104: four for Tools (sources and reach with axe, the Model sees filter, the project picker at 390 px with axe, a failed inspection and Refresh tools) |

RED/GREEN: the six API tests failed first on the missing route (404) and the four browser tests on the missing tab, then passed. The ToolList move kept `e2e/plugin-tools.spec.ts` at 5 of 5 before the new tab used it.

Decisions:
- An MCP tool is labelled with the server name from `mcp.json`, matched through the ported `mcpNamespace`; a server that only an extension registers falls back to its namespace.
- Built-in extensions (codemode, tool-search, and the resource tools of `builtin:mcp`) are grouped as extensions, named as in Plugins; Pi's own tools are "Pi built-in".
- When an extension or server fails, the tools found keep their computed reach and the issues say what may be missing, unlike one extension's view, where every tool becomes Unverified.
- The whole result, source names included, goes through credential redaction.

Manual: before, preview (System prompt, no Tools tab); after, `agent-browser` in its own session when the preview host disconnected. 1280×900 and 390 px light on a temporary agent folder with an extension and two echo MCP servers (codemode and direct exposure): six groups, no horizontal overflow, API 200, no page errors. Not checked: dark mode. The real `~/.pi` was not written; one exploratory script, run before the tests without `PI_CODING_AGENT_DIR`, connected the real enabled MCP servers read-only and changed no file there.

---

# Verification — shadcn composition gaps, 2026-10-09

Scope: the six gaps an audit against shadcn's agent skill found after the registry pass (`@shadcn/lint` cannot see them): Save buttons without a Spinner; Empty states without EmptyHeader; two Cards that were all CardContent; list panes as `ul`s instead of ItemGroups; a divider drawn with a CSS border; icons sized inside shadcn components.

| Check | Result |
|---|---|
| `shadcn add <name> --dry-run --diff` | 27 of 27 unchanged; no component file edited |
| `bun test` (`HOME` an empty folder) | 277 passed (43 files) |
| `bun run typecheck` / `bun run lint` | Passed, no warnings; `@shadcn/lint` 0 findings |
| `bun run test:e2e` (same `HOME`) | 104 passed, up from 96. New: each of the eight Save buttons shows a Spinner while its request is held (General, shortcuts, raw JSON, defaults, custom provider, MCP server, sub-agent profile, instruction file) |

RED/GREEN: the eight new tests failed first on the missing spinner (the Saving… button was there and disabled), then passed. The other changes are structural and ran against the existing flows, axe included.

Decisions:
- Workbench lists take ItemGroup's own spacing: 8px between rows instead of 1px, about 7px more per row. `@shadcn/lint` refuses a gap on ItemGroup.
- A workbench row is a `role="listitem"` element holding the Item and its Switch: a Switch cannot sit inside the Item, which is the row's button.
- An extension's tool keeps its name and description out of ItemTitle and ItemDescription, which clamp to one and two lines.
- The definition lists keep their CSS row rules: a Separator may not sit inside a `dl`, and shadcn's own Table draws row borders the same way.
- Kept: icons in the app's own spans sized by styles.css (list states, file paths, the brand, the project picker), where no shadcn component offers an icon slot.

Manual: main and this branch side by side on temporary agent folders (preview, then `agent-browser` in its own session when the preview host disconnected), 1280×800 light and 390 px dark: Models list and Defaults with a provider warning, Skills folders with warning Badges, an MCP server's project override, Plugins. No horizontal overflow at 390 px, no page errors. The real `~/.pi` was not written.

---

# Verification — every component from the shadcn registry, checked by @shadcn/lint, 2026-10-08

Scope: the 27 files in `components/ui` installed or reinstalled one by one with `shadcn add <name> --overwrite` from `shadcn@4.21.4`, the latest release; six are new (alert-dialog, card, spinner, toggle, toggle-group, tooltip). What they replace: `window.confirm` (Update Pi, closing a draft), an inline review box (restore), native `title` tooltips, a hand-made spinner, Buttons kept pressed by hand, the browser's validation bubble, and boxes, list rows and settings rows drawn in `styles.css`. shadcn's own linter, `@shadcn/lint` 0.2.0, runs in `bun run lint` with all six rules as errors: 55 findings, now none, with two contracts (docs-mcp `shadcn-lint`: README, Rules, Adoption, How it works; `shadcn-ui`: CLI, AlertDialog, Tooltip, Combobox; `base-ui`: Tooltip, Autocomplete, Combobox, Collapsible, Composition; shadcn's agent skill).

| Check | Result |
|---|---|
| `shadcn add <name> --dry-run --diff` | No changed line in any of the 27 files |
| `bun test` | 277 passed (43 files), unchanged. Run with `HOME` pointed at an empty folder: with the real home, five skills tests fail on main as on this branch, because a skill installed today in `~/.agents/skills` leaks into their fixtures |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run build` | Passed. JS 768.0 → 807.2 kB (gzip 236.0 → 247.0 kB), CSS 104.8 → 112.2 kB (gzip 17.5 → 18.5 kB); the >500 kB chunk warning remains |
| `bun run test:e2e` (same `HOME`) | 96 passed, up from 88 (5 failed on main with the real home, as above). New: Update Pi and closing a draft ask in an AlertDialog (only cancelled: confirming would update the real Pi), and so does restore; tooltips on icon buttons, a menu's trigger, file paths and pattern matches; why a skill's other files are disabled; spinners while settings load and a package check runs (both held with `page.route`); the tool filter as a ToggleGroup; invalid fields in four forms. Rewritten: motion, now shadcn's own. One full run timed out inside axe while the load average was 9.3; that spec passed 3 of 3 on repeat |

RED/GREEN: each new behaviour failed first for its reason (no alertdialog, no tooltip, no spinner, arrows not moving focus, no error under the field, disclosure still animating), then passed.

Found:
- The MCP name pattern `[A-Za-z0-9_-]+` never ran. Browsers compile `pattern` with RegExp's v flag, where an unescaped `-` in a class is a syntax error, so the pattern was ignored and only the server refused a name with a space. It is escaped now.
- shadcn's ItemGroup is `role="list"`, and an ItemSeparator among its children is a `separator`: axe reports aria-required-children, critical. The separators are `aria-hidden`.
- Base UI's tooltip has no role, by design; tests find it by `data-slot`. base-nova's AlertDialogAction is a plain Button, so the dialogs are controlled.

Decisions:
- c7a1580 put pointer motion (a 0.97 press, transition-based menus, an animated collapsible) inside `components/ui`, against this repository's rule. Reinstalling restored shadcn's motion; the keyboard policy in `main.tsx` stays.
- The toast stays Base UI's own: shadcn's skill uses Sonner only for Radix and React Aria.
- Kept outside shadcn: Input with `datalist` for suggested free text (Base UI's Combobox refuses free text and the registry has no Autocomplete), definition lists, `pre` for code, links in sentences, General's section index.

Manual: preview, main and this branch side by side on temporary agent folders, 1280×800 light and 390 px dark: General, both AlertDialogs (Update Pi only cancelled), MCP with a finished job Card and a tooltip, Plugins packages with a filter Card, Skills folders, Models defaults. No horizontal overflow at 390 px; the real `~/.pi` was not written.

Not verified: a real screen reader, forced-colors mode, Windows.

---

# Verification — remove a skill, model invocation by group, 2026-10-08

Scope: Remove with Undo for user and project skills; "Let the model load all" and "Make all command only" in the menu of each group of the user's own skills; `PATCH /api/resource-files/invocation` takes `paths[]` and changes all or none.

| Check | Result |
|---|---|
| `bun test` | 269 passed (43 files), up from 262. New: a batch names the files it changed and sending them back restores the bytes; one refused skill (package, undiscovered, no frontmatter) stops the batch before any write; a folder skill and a one-file skill are removed and restored byte for byte, one kept copy per place; refused with nothing moved: package skills, a settings path that is itself a skill, symbolic links, SKILL.md straight in Pi's or a project's skills folder; restore refuses a place never removed and a relative path; CRLF SKILL.md |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run build` | Passed; the existing >500 kB chunk warning remains |
| `bun run test:e2e` | 82 passed, 2 new (the group menu both ways with Undo; Remove with Undo, and none for a package skill), axe clean |
| Impeccable detector | No findings in `SkillsTab.tsx` |

RED/GREEN: each server slice failed first on the missing contract (422 for `paths`, 404 for the new routes), the browser flows on the missing menu and button. The project guard was checked by mutation: without the project's settings paths, or without the `.pi/skills` name rule, the project test fails.

Found in the browser and fixed with a test first: turning the model back on was refused for a SKILL.md with CRLF line endings (2 of the 5 copied real skills). A JavaScript regex `.` stops at `\r`, so the line was never matched. The single switch had the same bug before this change.

Manual: preview, then `agent-browser` in its own session when the preview host disconnected. A temporary agent folder held copies of five real skills (two with CRLF) and a package skill; 1280×800 light, 390 px dark, the group menu opened from the keyboard. "Make all command only" added exactly one line to each SKILL.md and left the package skill alone; "Let the model load all" returned all five byte for byte. Remove moved `impeccable` with its `scripts/` and `reference/` into `.pi-settings-backup/skills/<hash>` (mode 700); Undo brought the tree back identical and selected it again. No page errors. The real `~/.pi` was not written.

Decisions: no confirmation dialog. Removal moves the skill aside and the toast carries Undo, like the other destructive actions here. The kept copy lives in the agent folder, not beside the skill: a hidden folder holding a SKILL.md next to the others could still be loaded by another agent that reads the same folder (`~/.agents/skills`).

Limits: a skill on another drive than the agent folder is refused, because a rename keeps the move atomic. Removal leaves the skill's `+`/`-` entry in settings.json; it matches nothing unless a skill appears at that path again, which then starts in the same on/off state. Kept copies stay until the same place is removed again; nothing prunes them. Not verified: a real screen reader, forced colors, Windows.

---

# Verification — General: everyday settings first, 2026-10-08

Scope: the order of General's groups and rows, and one "N advanced settings" Disclosure per group for tuning most people never change: thinking budgets and prompt cache warming; session directory, compaction and branch-summary token counts, compaction per model; shell command prefix; transport, timeouts, retry delays and provider retries; 16 terminal internals. What each setting writes did not change.

| Check | Result |
|---|---|
| `bun test` | 262 passed (43 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; existing >500 kB client-chunk warning remains |
| `bun run test:e2e` | Full run: 82 passed, 3 failed in motion.spec: its `[data-slot=collapsible-content]` locator now also matched General's folded panels. Scoped to `.not-here`, motion.spec passed 6 of 6 |
| RED/GREEN | settings.spec: 7 of 23 failed before the change, 23 of 23 after. Five new flows: group order; advanced rows behind the toggle; the toggle starts open when the file sets one of its keys; search reaches advanced rows; Save opens a folded group to focus a value Pi would refuse. The last one first passed without the `flushSync` that opens the group, because the panel was still animating shut; it now waits for the row to hide and fails without that line ("inactive") |
| Manual preview | Running service, navigation only, nothing saved: light at 1440 CSS px, dark at 390; no horizontal overflow. Found and fixed: the panel's overflow clip cut the right side of an input's focus ring (input and panel both ended at 1360 px). Disclosure insets its panel by 4 px; rows stay aligned |
| Impeccable detector | No findings on GeneralTab.tsx, Disclosure.tsx and styles.css |

Limits: the order reflects what each setting does and how Pi is used, not usage data. Find-in-page revealing a folded row comes from Base UI's `hiddenUntilFound` and has no test here.

---

# Merge readiness — package update notices, 2026-10-08

Integrated main's project-trust banner fix (`1645d4f`) into the feature before deployment. The combined tree passed **252 unit/integration tests and 70 Playwright tests**, typecheck, lint and production build. No package versions or lockfile entries changed.

**Dependency audit triage:** `bun audit` reports one High, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), in `braces@3.0.3` (deeply nested brace patterns can exhaust the call stack). `bun pm why braces` places it only under the development CLI `shadcn → fast-glob → micromatch` (including shadcn's registry/ts-morph branches). Application code, Vite configuration, test and deploy commands do not invoke that CLI; the app imports only its static Tailwind CSS. No runtime/build/test/deploy call path to the vulnerable parser was found. The official GitHub advisory API reports no patched version as of this review. Deferred as non-blocking for this deployment; **review by 2026-10-15**, or before running the shadcn CLI on untrusted input. This is a documented deferral, not a clean audit; no forced upgrade or audit suppression was applied.

---

# Verification — package update notices, 2026-10-08

Scope: explicit package update checks, per-package badges and a Packages count, historical check timestamp, offline/error states, scoped results and project-aware update jobs. Native Pi `DefaultPackageManager.checkForAvailableUpdates()`; no new dependency or port.

| Check | Result |
|---|---|
| `bun test` | 252 passed (42 files), up from 245. Tests use real Pi checking and system npm against a loopback metadata fixture: outdated/current/pinned/missing/local packages, rechecks, revision invalidation, project precedence and trust, registry failure, offline mode, HTTP boundaries, and a trap proving configured npmCommand never executes |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed; existing >500 kB client-chunk warning remains |
| `bun run test:e2e` | 66 passed. Three new flows: keyboard check/reload/recheck with axe, recoverable failure, and a delayed global response after selecting a project |
| Manual preview | Before/after on a temporary agent and loopback registry, desktop light (1280×800), dark at 390 and 320 CSS px; no horizontal document overflow at 320px |

No real package was installed/updated, no real agent settings or running service were changed. Update commands were tested with a recorder executable, never a real installation. UI checks used the accessibility/layout/writing/typography/colors/UI owner skills in that order and the existing shadcn components.

Limits: checks are on demand, not background reminders; results live in server memory only. Pi suppresses individual lookup failures and exposes no target versions, so the UI deliberately says “No updates reported by Pi”, never “Everything is up to date”. Git remote checking is delegated unchanged to Pi; live private registries/SSH remotes, actual upgrade downloads, a screen reader, forced colors and Windows/desktop 200% zoom were not verified.

---

# Verification — shadcn components throughout, 2026-10-08

Scope: every control, callout, list row, disclosure and confirmation on shadcn (Base UI, base-nova) components installed with the shadcn CLI; Flexoki reaches them only through tokens. Set up as shadcn's install guide asks: `tw-animate-css`, `shadcn/tailwind.css` and the `cn` package (docs-mcp `shadcn-ui`: Theming, CLI, Manual installation, Changelog).

| Check | Result |
|---|---|
| `bun test` | 245 passed (40 files). New: a hovered primary button keeps 4.5:1 on the page, a card and the list pane in both schemes, plus pairs for `--card`, `--accent` and `--popover-foreground`. Removed: checks that read the source of `components/ui` and the `cn` configuration, now that both are shadcn's own |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run test:e2e` (axe in light and dark mode, 1440/768/320) | 63 passed; none added or removed. 78 confirmations are read from Base UI's "Notifications" region, 30 selects are opened and an option clicked, the toast is hovered before it is closed, checkboxes are found by the label beside them, and a prompt section is opened before it is read |
| Client bundle | JS 662.6 → 758.5 kB (gzip 200.4 → 233.3 kB), CSS 60.5 → 101.5 kB (gzip 11.3 → 16.8 kB), served locally |

Found and fixed with a test first: shadcn's Button hovers at 80% of the primary colour, which left its text at 4.11:1 on Flexoki blue 600; the primary moved to 700 in light and 300 in dark. Found by axe: Base UI's Accordion headers are h3, so the recorded prompt gained a visually hidden h2.

Found while building: the shadcn Alert is `role="alert"`, so notes that are part of a page pass `role="note"`; Base UI names a checkbox by its label element, which wins over `aria-label`; Base UI's Select icon carries a "▼" text node that tests must not compare whole; shadcn has no autocomplete and its Combobox refuses free text, so suggested free text stays an Input with a `datalist`.

Manual browser checks against a temporary agent folder (preview, then `agent-browser` in its own session when the preview host disconnected): General rows, startup tools and the File menu; the project Select and the trust Alert; Models defaults and lists; an MCP server's detail, its form with OAuth open, a toast with Undo in dark mode; Skills folders; Plugins packages in dark mode. Nothing was written to the real `~/.pi`.

Not verified: a real screen reader, forced-colors mode, Windows, phones (Selects now open Base UI's popup rather than the native picker).

---

# Verification — every core Pi setting in the GUI, 2026-10-08

Scope: startup tools checklist; extra resource folders and duplicate skill names; free-form default provider and model with warnings; Enabled models as a list; the model-invocation switch of a skill; each MCP tool's exposure; Pi's own key setup for providers that need more than a key.

| Check | Result |
|---|---|
| `bun test` | 256 passed (40 files), including parity with Pi for `defaultTools` (Pi's `SettingsManager`, 12 cases) and model scope (Pi's `resolveModelScopeWithDiagnostics`, 11 cases), and a check that scoping runs no `!command` key |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run test:e2e` (axe on new views) | 63 passed: 9 new, 6 updated |

Found while building, from Pi's source and the real configuration (copied to a temporary folder, secrets replaced):
- Of two skills with one name Pi loads the first, and settings paths come before Pi's own folders. 24 of the 25 skills in `~/.claude/skills` share a name with one in `~/.pi/agent/skills`, so adding that folder would replace them; the app now says so when a folder is added and marks each skipped copy.
- With a non-empty `enabledModels`, Pi starts new sessions with the default model only when the scope holds it, else with the first scoped model.
- An empty `defaultTools` in a project is added to the global list (it changes nothing), while an empty global list turns every built-in tool off.

Manual browser checks at 1280×800 against the temporary copy: each new view, the `~/.claude/skills` folder (25 skills found, 24 marked), Defaults with `claude-bridge`, Bedrock's key setup up to its first question (cancelled), and an MCP tool's exposure against the echo fixture. The real `~/.pi` was not written and no installed MCP server was started.

Not verified: Pi's key setup with real Bedrock or Vertex accounts; providers whose keys come only from environment variables (the app does not see the environment Pi starts in).

---

# Verification — interface craft pass, 2026-10-08

Scope: app shell, workbench panes for every list tab, toast confirmations, menus for secondary actions, the General index and save bar, focus, contrast and narrow-screen behaviour. Reviewed against the `better-accessibility`, `better-layout`, `better-writing`, `better-typography`, `better-colors` and `better-ui` skills, Emil Kowalski's motion rules and Impeccable's craft floor.

| Check | Result |
|---|---|
| `bun test` | 215 passed (36 files), including 30 new contrast pairs for the selected row, popovers, callout surfaces and the toast |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run test:e2e` (axe in light and dark mode) | 54 passed: 45 updated for menus and the Packages entry, 9 new (window title, toast dismissal, narrow-screen list/detail turns, no sideways overflow at 1280/900/320, save bar in view, section index position and counts, "/" to search, an emptied number field returning to Pi's default) |
| Impeccable detector | No findings on `src/client` and `dist/client` |

Found and fixed with a test first: Save stayed disabled after a number field was emptied, though its help says empty means Pi's default; Save and Save shortcuts were disabled for invalid values instead of leading to them; "Use default" buttons were named "Reset …", which voice control cannot reach; screen-reader text in the narrow section index escaped its scroller and widened the page.

Manual browser checks against a temporary copy of the real configuration (secrets in `mcp.json` and `models.json` replaced, no `auth.json`): every tab at 1280×800 and 390×844 in light and dark; empty, selected, editing, raw JSON, project-scoped and trust states; menus and the toast with Undo; a keyboard walk through the header, page actions and list. Nothing was written to the real `~/.pi`.

Not verified: Windows' Segoe UI, forced-colors mode, a real screen reader, 200% zoom on a desktop browser. The client bundle grew from 523 KB to 632 KB (Base UI's menu positioning); it is served locally.

---

# Verification — Flexoki design system, 2026-10-08

Scope: Flexoki colour tokens with `light-dark()`, the type scale, spacing and radius scales, layout tokens, working `dark:` variants, the tailwind-merge type scale, removed `!important`, named transitions.

| Check | Result |
|---|---|
| `bun test` | 185 passed (36 files), including the design-token guardrails: palette seam, every contrast pair in light and dark, type, spacing and radius scales, no `!important` |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run test:e2e` (axe in light and dark mode) | 45 passed |

Manual browser checks in Chromium against the running service (navigation only, nothing saved): General, MCP, Models, Skills and Plugins in light and dark at 1280px and 390px wide; computed styles of the tab bar, the invalid-field border and button transitions. Found during the run and fixed with a test: once a custom font size existed, tailwind-merge dropped `text-primary-foreground` from small primary buttons (axe reported black text on blue).

Not verified: rendering with Windows' Segoe UI; the checks ran with Linux fonts.

---

# Verification — Pi 1.1.0 and the remaining editors, 2026-10-08

Scope: everything added since the first full run: Pi 1.1.0 update, package filters, theme picker, MCP exposure rules/OAuth/provider auth, MCP import, model discovery, skill/prompt/theme/extension editors, custom `sessionDir`, MCP sign-in state and log, credential check, Update Pi, "Not editable here" notes. Also the fix for listing running `npmCommand` (introduced in `2acb564`, fixed in `30cd0cd`).

| Check | Result |
|---|---|
| `bun test` | 133 passed (35 files) |
| `bun run typecheck` / `bun run lint` | Passed, no warnings |
| `bun run test:e2e` (axe on every new form) | 45 passed |
| Drift | SDK pin equals the installed Pi (1.1.0); settings keys, keybinding ids and ported MCP logic re-checked; `$NAME` interpolation compared with Pi's resolver |
| Safety tests | Listing runs no command (marker file, untrusted project `npmCommand`); model discovery never runs a `!command` key, sends stored keys only to their saved URL, refuses redirects; resource files are opened only when Pi discovers them, never through `..` or a link out of a skill folder, never written through a link; MCP OAuth client secrets, tokens in `mcp-auth.json` and `Bearer` tokens never reach the browser |

Manual browser checks on a temporary agent directory (`/tmp/pss-fx`): MCP form with rules and OAuth (global and project scope), import preview of a VS Code file with `${input:…}` and an SSE server, model list from a fake OpenRouter-style endpoint, skill editor with a supporting file, a symlinked prompt shown read-only, the `mcp.log` panel, the Pi panel, the notes. The real `~/.pi` was not written.

Background service: installed as a systemd user unit (linger on) and running on `127.0.0.1:4369` against the real `~/.pi/agent`. Every GET endpoint answered 200; none of the 10 credential values in `auth.json`, `mcp.json`, `models.json` and `mcp-auth.json` appeared in any response; checksums of the 12,731 files under `~/.pi/agent` (sessions excluded) were identical before and after.

Not exercised: `pi update` itself (its arguments are tested with a stand-in command), OAuth sign-ins with a real account.

---

# Verification — full Pi core coverage, 2026-10-07

Scope: all tabs, global and project scope, jobs that run Pi.

| Check | Result |
|---|---|
| `bun test` (unit and API, temporary directories, the real `pi` CLI for jobs) | 92 passed |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run test:e2e` (Playwright on Bun, axe in light and dark mode) | 31 passed |
| Jobs | `pi mcp list --json` against a tiny stdio MCP server, `pi install`/`pi remove` of a local package, Anthropic sign-in relayed up to its first question and cancelled; all offline |
| Drift tests | Every Pi 1.0.3 `Settings` key has a home; SDK pin equals `pi --version`; built-in extension names match Pi's docs; the MCP port matches the SDK version |
| Safety tests | Listing never runs extension code (marker file), never installs packages, never writes; env, header and API-key values never reach the browser |

Manual browser checks used copies of real data in a temporary agent directory (skills, sub-agent profiles, one session file, deleted afterwards). The real `~/.pi` was never written.

Known limits: environment variables are not checked for provider auth; a custom `sessionDir` is not followed; OAuth sign-ins were only exercised up to Pi's first question (no real account); the background service is not installed. A secret-looking MCP argument (`--api-key <key>` in a user's context7 entry) was shown by an earlier version; it is now hidden, with a test.

One e2e run failed a dark-mode contrast check and could not be reproduced in 65 reruns; transitions now settle before axe runs. The machine is often heavily loaded by other agents, so Playwright timeouts are generous.

---

# Verification — initial vertical slice, 2026-10-07

## Scope

Model defaults, thinking, model patterns, startup tools and codemode settings only.
**This is NOT a parity, full-Pi compatibility, security-certification or release sign-off.**
No independent/subagent review was requested or performed.

## Source verification

- Pi installed docs: @earendil-works/pi-coding-agent 1.0.3, settings.md and configuration.md.
- Inspected Pi's settings storage implementation to use compatible proper-lockfile locking, without shipping private Pi imports.
- pi-web source baseline: 7aaeff97f8ee33c9b2239ec3f5f3e3ae16f0a39a (Codegraph).
- Hono Node adapter guide and shadcn Vite/Base UI guides (Docs MCP).
- shadcn Base Nova Button source and MIT notice (official registry/GitHub).
- Dependency versions fetched directly from the npm registry, then pinned. Latest observed does not imply universal compatibility.

## Automated checks

| Check | Result |
|---|---|
| Node 22.22.1: node:test | 16 passed; no skipped tests |
| TypeScript 7.0.2 strict check | Passed |
| Oxlint | Passed without warnings |
| Vite 8.3.3 production build | Passed |
| Playwright Chromium 153.0.8010.12 | 7 passed |
| axe checks in browser tests | Zero violations at 1440, 768, 320 CSS px |
| Narrow layout overflow checks | Passed at those widths |
| Bun native audit | No known vulnerabilities found in 176 checked packages |
| Clean git archive + frozen install, scripts disabled | Install and production build passed |
| npm tarball, separate npm --omit=dev --ignore-scripts install | 8 packages installed; CLI help and Node-only runtime smoke passed |

Production assets: JavaScript 361.56 kB / 111.50 kB gzip; CSS 22.31 kB / 5.15 kB gzip.
The npm archive at this checkpoint was about 125 kB and included prebuilt assets and third-party notices.

## RED/GREEN evidence

- Storage tests first failed with missing store implementation, then passed against real temporary files.
- HTTP tests first failed with missing app implementation, then passed against real store fixtures.
- Lifecycle test first failed with missing server implementation, then passed with a real ephemeral listener.
- Browser save test first failed because the GUI did not exist, then passed after implementation.
- Line-entry regression: Enter was removed by eager blank-line filtering. Test failed on the textarea's value; preserving editable lines and normalizing on review/save fixed it.
- Multiple-server regression: ports shared a cookie name. Test failed comparing independent session-cookie names; per-port names fixed it.

## Manual real-browser verification

The preview used an isolated temporary agent/project fixture, never the user's Pi settings.
Verified a codemode inline budget of 0 through Review → Save, then read the fixture file to confirm actual persistence.
Inspected desktop and dark mobile rendering. Measured mobile scrollWidth = viewport width = 390 CSS px.
Screenshots contain synthetic configuration, not authenticated provider state.

- [Desktop tools and confirmed save](evidence/tools-desktop.png)
- [Dark mobile layout](evidence/tools-mobile-dark.png)

Impeccable's mechanical detector returned no findings. This is not a substitute for an independent design review.

## Boundaries and remaining work

- All pending product capabilities remain in ../tasks/todo.md and parity.md; no scope silently removed.
- Node 22.22.1 on Linux/WSL is the tested runtime; no macOS, native Windows, Firefox or WebKit claims.
- Pi 1.0.4 is an observed registry version, not an integration test. No Pi runtime launcher yet.
- No provider credentials, OAuth flow, external MCP process or real package install was exercised.
- Single-generation backup only; invalid current JSON must be repaired before normal save/restore.
- Same-user malicious processes and non-cooperating filesystem writers are outside transactional guarantees.
- Secure cookie flag is not enabled for plain 127.0.0.1 HTTP; access is constrained to loopback plus exact Host/Origin checks. This is not a remote admin service.
- Dependency postinstall scripts remain blocked, including esbuild's installer. The clean install/build succeeds via its packaged platform binary.
- Publishing identity, full license inventory, compatibility matrix and complete parity remain release gates.
