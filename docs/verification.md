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

Manual: main and this branch side by side on temporary agent folders (T3 preview, then `agent-browser` in its own session when the preview host disconnected), 1280×800 light and 390 px dark: Models list and Defaults with a provider warning, Skills folders with warning Badges, an MCP server's project override, Plugins. No horizontal overflow at 390 px, no page errors. The real `~/.pi` was not written.

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

Manual: T3 preview, main and this branch side by side on temporary agent folders, 1280×800 light and 390 px dark: General, both AlertDialogs (Update Pi only cancelled), MCP with a finished job Card and a tooltip, Plugins packages with a filter Card, Skills folders, Models defaults. No horizontal overflow at 390 px; the real `~/.pi` was not written.

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

Manual: T3 preview, then `agent-browser` in its own session when the preview host disconnected. A temporary agent folder held copies of five real skills (two with CRLF) and a package skill; 1280×800 light, 390 px dark, the group menu opened from the keyboard. "Make all command only" added exactly one line to each SKILL.md and left the package skill alone; "Let the model load all" returned all five byte for byte. Remove moved `impeccable` with its `scripts/` and `reference/` into `.pi-settings-backup/skills/<hash>` (mode 700); Undo brought the tree back identical and selected it again. No page errors. The real `~/.pi` was not written.

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
| Manual T3 preview | Running service, navigation only, nothing saved: light at 1440 CSS px, dark at 390; no horizontal overflow. Found and fixed: the panel's overflow clip cut the right side of an input's focus ring (input and panel both ended at 1360 px). Disclosure insets its panel by 4 px; rows stay aligned |
| Impeccable detector | No findings on GeneralTab.tsx, Disclosure.tsx and styles.css |

Limits: the order reflects what each setting does and how Pi is used through T3Code, not usage data. Find-in-page revealing a folded row comes from Base UI's `hiddenUntilFound` and has no test here.

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
| Manual T3 preview | Before/after on a temporary agent and loopback registry, desktop light (1280×800), dark at 390 and 320 CSS px; no horizontal document overflow at 320px |

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

Manual browser checks against a temporary agent folder (T3 preview, then `agent-browser` in its own session when the preview host disconnected): General rows, startup tools and the File menu; the project Select and the trust Alert; Models defaults and lists; an MCP server's detail, its form with OAuth open, a toast with Undo in dark mode; Skills folders; Plugins packages in dark mode. Nothing was written to the real `~/.pi`.

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

Not verified: Pi's key setup with real Bedrock or Vertex accounts; providers whose keys come only from environment variables (the app does not see T3Code's environment).

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
**This is NOT a parity, full-Pi compatibility, T3 integration, security-certification or release sign-off.**
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

T3 preview used an isolated temporary agent/project fixture, never the user's Pi settings.
Verified a codemode inline budget of 0 through Review → Save, then read the fixture file to confirm actual persistence.
Inspected desktop and dark mobile rendering. Measured mobile scrollWidth = viewport width = 390 CSS px.
Screenshots contain synthetic configuration, not authenticated provider state.

- [Desktop tools and confirmed save](evidence/tools-desktop.png)
- [Dark mobile layout](evidence/tools-mobile-dark.png)

Impeccable's mechanical detector returned no findings. This is not a substitute for an independent design review.

## Boundaries and remaining work

- All pending product capabilities remain in ../tasks/todo.md and parity.md; no scope silently removed.
- Node 22.22.1 on Linux/WSL is the tested runtime; no macOS, native Windows, Firefox or WebKit claims.
- Pi 1.0.4 is an observed registry version, not an integration test. No Pi/T3 runtime launcher yet.
- No provider credentials, OAuth flow, external MCP process or real package install was exercised.
- Single-generation backup only; invalid current JSON must be repaired before normal save/restore.
- Same-user malicious processes and non-cooperating filesystem writers are outside transactional guarantees.
- Secure cookie flag is not enabled for plain 127.0.0.1 HTTP; access is constrained to loopback plus exact Host/Origin checks. This is not a remote admin service.
- Dependency postinstall scripts remain blocked, including esbuild's installer. The clean install/build succeeds via its packaged platform binary.
- Publishing identity, full license inventory, compatibility matrix and complete parity remain release gates.
