# Verification — Pi SDK 1.1.0 to 1.2.0, 2026-10-13

Scope: `package.json` and `bun.lock` (both Pi packages pinned to 1.2.0), `tests/settings-drift.test.ts`, `tests/keybindings.test.ts`, `src/server/keybindings.ts`, the version constants and "re-checked against" comments of the ported code, `src/server/plugin-tools-probe.ts`, `src/server/themes.ts`, `src/shared/settings.ts`, `docs/parity.md`, `docs/plugin-tools.md`, `THIRD_PARTY_NOTICES.md`, the demo snapshot and this record. No AGENTS.md change. Nothing was published or deployed.

- Ported logic against 1.2.0. Byte for byte the same as in 1.1.0: `core/mcp-servers.js`, `extensions/mcp/config.js`, `core/model-resolver.js`, `core/resolve-config-value.js`, `extensions/mcp/oauth.js`, `config-selector.js`, `core/system-prompt.js`, `extensions/index.js` and the example subagent files. The same functions: `applyToolModifiers`, `resolveDefaultTools`, `mergeDefaultTools`, `clampThinkingLevel`, `getHomeDir`, `renderToolSection`, `prepareCodemodeLoadout`. The 90 keybinding actions keep their ids, descriptions and defaults, and pi-ai's `KnownApi` is unchanged. Changed, and followed through the SDK: `package-manager.js` (`~` in `!`, `+` and `-` path entries) and `resource-loader.js` (a symlinked AGENTS.md in a worktree). `before_agent_start` events now carry `messageType`; the preview's own event has it too. Pi's built-in handler ignores it, so no test can see that line.
- Test first. After the bump four tests failed. The two settings drift tests were blind, not red for a new key: Pi moved its `Settings` interface out of `settings-manager.d.ts`, so the regex found nothing. They now read Pi's published `schemas/settings.schema.json`, skipping deprecated keys. With that reader and no home for it the test failed naming `$schema` alone; `settingHomes` now has it. The other two failures were the version checks of the MCP port and the keybinding catalogue, bumped after the comparison above. A new test ("the $schema editor hint is no unknown action, and saving keeps it") failed because keybindings.json listed `$schema` among the unknown ids, and passes with the filter.
- Local checks: bun test (406 passed), `bun run typecheck`, lint, build and test:e2e (186 passed, 6.7 minutes).
- Browser check with agent-browser on a throwaway server and an empty home whose settings.json and keybindings.json carry `$schema`: the header reads "Built for Pi 1.2.0", General › Pi shows no "checked against" note, the Hardware cursor row shows Pi 1.2.0's wording, and `$schema` appears neither as a custom setting nor in the shortcuts. Through the API: `$schema` in models.json survives a provider edit, and a theme file with `$schema` is listed.
- Demo snapshot re-recorded: 54 lines changed (Pi 1.2.0's model catalog, timestamps, a file revision, `/api/pi`). `bun run record:demo` puts `node_modules/.bin` first on PATH, so it records that `pi` instead of `~/.local/bin/pi`; this one ran `bun src/demo/record.ts`. The hosted demo still serves the old snapshot until it is deployed.
- pi-web review since `fdeea87`: by commit messages and changed files, not full diffs. Two candidates, recorded in `docs/parity.md`: Fetch models keeping capability metadata, and providers registered at `session_start`.
- Not performed: a session on a real Pi 1.2.0, how Pi 1.2.0 treats a user theme with unsupported metadata, the demo deploy, a release.

---

# Verification — header names the Pi version the app was built for, 2026-10-13

Scope: `src/client/App.tsx`, `src/client/styles.css`, one test in `e2e/shell.spec.ts`, `DESIGN.md`, `README.md` and this record. No server, dependency, lockfile or AGENTS.md change. Nothing was published.

- The header now reads "Built for Pi 1.1.0" beside the π wordmark on every tab. The version is `builtFor` from `/api/pi`, the version of the pinned SDK, so the label and the note in General › Pi share one source. The installed Pi stays in General › Pi.
- Test first: "the header names the Pi version the app was built for, on every tab" failed on the old build (the text was not in the banner) and passes with the label. It reads the expected version from `node_modules` and runs axe on the page.
- Local checks: bun test (404 passed, 1 failed), `bun run typecheck`, lint, build and test:e2e (186 passed, 5.9 minutes). The failing test is "the Pi SDK pin matches the pi installed on this machine": `pi` on PATH is 1.2.0 and the pin is 1.1.0. It is the existing guard for a Pi update, not this change; on a copy with the SDK pinned to 1.2.0 it passes.
- Browser check with agent-browser against a throwaway server on an empty home (stopped afterwards). Before, the header had no version, and the only mention of 1.1.0 was the note in General › Pi. After, the label shows at 1280 px in light and dark. At 390 px it shows too, and the project select is cut off sooner ("None (g…" for "None (global only)").
- Not performed: a check on a real phone, and a bump of the pin to 1.2.0 (the app was last checked against 1.1.0).

---

# Verification — type check with bun check on Bun 1.4.3, 2026-10-12

Scope: `package.json` (`packageManager` and the `typecheck` script), both `bun-version` pins in `.github/workflows/release.yml`, one test in `tests/release.test.ts`, one number in `docs/release.md` and this record. No application code, dependency, lockfile or AGENTS.md change. Nothing was published to npm.

- `bun run typecheck` now runs `bun check`, built into Bun 1.4.3, in place of `tsc --noEmit`. Bun's docs say it reports the same errors as `tsc` 7.0.2. `packageManager` and both release jobs pin Bun 1.4.3. `engines.bun` stays `>=1.4.2`, because running the app does not use `bun check`. `typescript` 7.0.2 stays in devDependencies for the editor.
- Test first: "every job runs the pinned Bun, and that Bun has bun check" failed on the old pin (1.4.2 is older than 1.4.3). With only `packageManager` raised it failed on the workflow's `bun@1.4.2`. It passes with all three pins at 1.4.3.
- Local checks on Bun 1.4.3 (the release zip, SHA-256 equal to the release's SHASUMS256.txt, first on PATH; the system Bun was still 1.4.2 then): bun test (405 passed), `bun run typecheck` (no errors in 215 files, 1.2 s; `tsc --noEmit` took 2.7 to 3.6 s on this tree), lint, build (client and demo; the existing >500 kB warning remains) and test:e2e (185 passed, 5.7 minutes).
- Gate: a file with `const n: number = "five"` made `bun run typecheck` exit 1 with TS2322, and removing it made it exit 0. On Bun 1.4.2 the script stops with `Script not found "check"`, so a machine needs Bun 1.4.3 to run it. After the system Bun was upgraded to 1.4.3, `bun run typecheck` (no errors in 215 files), lint and the release and package-metadata tests passed with no PATH change.
- Parity with `tsc`: on a temporary copy with 18 deliberate errors (wrong types, `noUncheckedIndexedAccess`, implicit any, a missing module, `never` exhaustiveness, private access, wrong argument count, Hono overloads, React prop and handler types), both printed the same 18 diagnostics once sorted. `bun test --check` checks only the files a test imports, so it does not replace `typecheck`.
- Not performed: a run of the release workflow on GitHub (setup-bun was not exercised with 1.4.3), other operating systems, and code with circular types, where Bun's own PR #45066 lists remaining differences from `tsc`.

---

# Verification — README installs from npm, 2026-10-11

Scope: `README.md`, `docs/release.md` and this record. No application code, workflow, dependency or AGENTS.md change.

- README: "Not on npm yet." is gone. Run now starts with `bun x pi-settings-studio` (with a note that it runs with your permissions and is not a sandbox, how to name a release, and that releases from 0.1.1 on carry provenance), then the source steps; the options are shared; Run in the background says it needs a clone because the npm package has no service unit; Security says installing from npm runs this package and its dependencies, and that provenance shows origin, not harmlessness. `docs/release.md` records 0.1.1 in the release history.
- Registry facts the text rests on, checked 2026-10-11: versions 0.0.0-stage, 0.1.0 and 0.1.1; latest is 0.1.1; the publisher of 0.1.1 is GitHub Actions (trusted publisher) with the maintainer's account as approver; the SLSA provenance names repository `Gohans1/pi-settings-studio`, ref `refs/heads/main`, workflow `.github/workflows/release.yml`, commit 23dba5f and run 38160208393 on a GitHub-hosted runner, and sits in the Sigstore log at index 3211671811. The registry tarball's SHA-256 equals the workflow artifact's (`720b2d9a…8479`).
- `npm audit signatures` (npm 11.21.0) on a consumer installed from the registry in a temporary directory: 125 packages with verified registry signatures and 40 with verified attestations, including pi-settings-studio@0.1.1; none invalid or missing.
- `bun x pi-settings-studio@0.1.1` from an empty directory with a temporary home and agent directory: `--help` works, the server starts, the page answers 200 with its security headers and `/api/settings/global` answers 200 with an Origin header. It left no files in the directory. The server was stopped and the temporary directories removed.
- Git tags: `v0.1.0` at 836ddb9 and `v0.1.1` at 23dba5f (annotated, pushed). Each tag's `package.json` has the matching version, and 23dba5f is the commit the provenance names.
- Docs checks: 18 local links and anchors valid, 4 shell blocks pass `bash -n`, `git diff --check`. Repository checks: bun test (404 passed), typecheck, lint.
- Not performed: build and test:e2e (no code has changed since the green run 38160208393), a look at the npm package page, other operating systems, `bun x` under systemd, and how `bun x` picks up newer versions (the README makes no claim). The npm page keeps the 0.1.1 README until the next release. `--help` still prints "Usage: bun src/server/cli.ts"; left for a later release.
- Still open on npm, both needing the maintainer's 2FA: Publishing access set to disallow bypass tokens, and an optional deprecation note on 0.1.0 (the registry shows none).

---

# Verification — release 0.1.1 after the bootstrap version went public, 2026-10-11

Scope: `package.json` version (0.1.0 to 0.1.1) and `docs/release.md`, plus this record. No application code, workflow, dependency or AGENTS.md change.

- The third Actions run (run 38158093135, commit 836ddb9) passed every build step (19 of 19) on the runner. Its artifact matched `SHA256SUMS` (`dea05719…ac83`) and `scripts/release.ts check` accepted it against the checkout; the asset file names were identical to a local build.
- The maintainer's account then approved the locally staged bootstrap copy of that artifact instead of rejecting it (the registry lists the account as approver; who clicked what is not known to this record). pi-settings-studio@0.1.0 went public at 2026-10-11T17:24:39Z, tagged latest. Its tarball's SHA-256 equals the artifact's, and it has **no provenance** (the registry's attestations endpoint answers 404). Nothing unsafe was found; it is only missing the origin record. A published version cannot be replaced, so the next release carries provenance.
- The trusted publisher (`Gohans1/pi-settings-studio`, `release.yml`, environment `npm`, stage permission only) is configured and shows "Pending validation" until a workflow publishes once through OIDC.
- The waiting run 38158093135 was cancelled, because its stage job would have staged an existing version.
- This change bumps the version so the workflow can stage 0.1.1 with provenance, and records 0.1.0's origin in `docs/release.md` and the bootstrap warning (approving a local stage publishes it without provenance).
- Local checks: release and package-metadata tests (13 passed), typecheck, lint, `git diff --check`. The full suite runs in the workflow.
- Not performed yet: the 0.1.1 workflow run, its OIDC staging and provenance, the maintainer's approval and the check of the published version.

---

# Verification — E2E waits for a closing tooltip before axe, 2026-10-11

Scope: two lines each in `e2e/models.spec.ts` and `e2e/sound.spec.ts`, and this record. No application code, workflow, dependency or AGENTS.md change; nothing has been published.

- The second Actions run (run 38157522029, commit 7042a49) passed bun test (404), typecheck, lint and both builds on the runner. test:e2e: 183 passed, 2 failed, both axe checks. `models.spec.ts:194` reported `region` (a portal outside the landmarks); `sound.spec.ts:86` reported `color-contrast` 1.06 (#f2f0e5 on #ebe9de). In both, the node was a tooltip popup in the middle of its dismissal (`data-closed`, `data-ending-style`). The stage job was skipped, so nothing reached npm.
- Cause: axe ran while a dismissed tooltip was still fading out of its portal; on the developer machine the fade had always ended first. This was **not reproduced locally**; the diagnosis rests on the failing DOM in the run's log.
- Fix: both tests wait until no `[data-slot=tooltip-content]` remains before running axe, as `mcp.spec.ts` and `settings.spec.ts` already wait for colour transitions to settle. A tooltip that never closed would still fail the test, after Playwright's expect timeout.
- Local verification: both tests passed 8 times each (16 of 16, 1.3 minutes), so the wait is reached every time; lint and typecheck pass.
- Not performed: a full local E2E run (two test files changed; the full suite runs in Actions) and a passing Actions run so far. Other axe checks (56 in 17 files) have the same exposure to a closing popup and were not changed; they passed on the runner.

---

# Verification — CI runs the locked Pi CLI, 2026-10-11

Scope: `.github/workflows/release.yml` and this record. No application code, dependency or AGENTS.md change; nothing has been published.

- The first Actions run (run 38157152604, commit 5f06a66) failed in the build job at `bun test`: 397 passed, 6 failed. The six tests drive the real `pi` CLI (credential check, `pi mcp list` status and job, a repeated job, local package install). The runner has no `pi`. The stage job was skipped, so the gate held and nothing reached npm.
- Reproduced with a clean environment (empty home set when the process starts, PATH without `pi`): the same 397 passed, 6 failed. The earlier simulation had left the real `pi` reachable and was withdrawn.
- Fix: the build job puts `node_modules/.bin` on PATH after the frozen install, so the tests use the Pi pinned in `bun.lock` and no separate download. In the same clean environment: 404 passed, 0 failed, 0 skipped (the test that compares the SDK pin with the installed Pi now runs).
- Not performed yet: a passing Actions run, and the E2E suite in this environment.

---

# Verification — tested-tarball npm release pipeline, 2026-10-11

Scope: release tooling and documentation only (`scripts/release.ts`, `tests/release.test.ts`, `.github/workflows/release.yml`, `docs/release.md`, lint/typecheck coverage of `scripts/`, one README link). The app, its dependencies and AGENTS.md are unchanged. Nothing has been published: the npm package is still not on the registry.

- `tests/release.test.ts` was written first and failed with `Cannot find module '../scripts/release.ts'`. It now has nine tests: the checker accepts a checkout-identical package; rejects packed `.npmrc`, traversal paths, links and special files, altered metadata, altered server code, a built page naming a missing asset, and consumer install hooks; and the workflow test pins the credential boundary (read-only default, no OIDC in the build job, staging only from main in the `npm` environment, no rebuild in that job).
- The tarball is packed once (`bun pm pack --ignore-scripts`: 392,062 bytes packed, 1.38 MB unpacked). `scripts/release.ts smoke` installs that exact file into a temporary consumer with an empty home and no install scripts, audits the consumer's production tree (145 packages, no vulnerabilities, no exceptions), runs the installed CLI `--help`, starts the installed server, and requests the HTML (with its security header), the JavaScript and `/api/settings/global`.
- The first two smoke runs failed and were fixed: `--production` writes no lockfile, so `bun audit` had nothing to read; then the settings URL was wrong (404). The final run passes.
- Browser check of the installed package (agent-browser, own session): the General tab loaded from the tarball's files, the console and page errors were empty. The browser was closed and the server stopped.
- The full project audit still reports `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm (high, no patched version published), reached only through the development-only shadcn CLI. The maintainer accepted it explicitly; the workflow ignores that one advisory in the development gate and keeps the unfiltered report. `bun audit --audit-level=high --ignore=GHSA-vfj7-8cjw-p6xm` exits 0 (544 packages, 1 ignored). This is an accepted exception, not a fix.
- `npm stage publish <tarball> --dry-run --access=public --tag=latest --ignore-scripts --json` (npm 11.21.0) accepted the workflow's options and changed nothing.
- Repository checks: bun test (404 passed), typecheck, lint and `git diff --check`. A first attempt to mimic a CI runner without Pi was not valid: the real `pi` under the home folder was still reached as a fallback, so its results are withdrawn (see the entry above). The environment `npm` on GitHub requires review by the maintainer and accepts deployments from main only.
- Not performed: a GitHub Actions run, actionlint (not installed), the OIDC staging step and its provenance with a tarball argument, configuring the npm trusted publisher, and the publication itself.

---

# Verification — resolve delegated README writing blockers, 2026-10-11

Scope: README copy only, plus this verification record; application code, service unit, dependencies and AGENTS.md are unchanged.

- Clarified startup previews in the introduction, screenshot alt text, Tools and Context descriptions. The limitations paragraph names skipped third-party hooks and possible host/provider differences, with a link to the existing explanation.
- Explicitly warns that inspection can load a selected project's extensions despite Pi's saved rejection, does not change trust.json, and requires selecting only projects whose code you trust.
- Separates CLI-backed jobs from provider sign-in/key setup and extension inspection through the app's pinned SDK. Models describes the provider catalog separately from extension-provider models and their credential setup in Pi.
- Adds user-service PATH guidance for Pi, its runtime, npm and MCP commands, with absolute-directory placeholders and the warning that systemd does not expand shell variables or tilde in Environment.
- Delegated review: two GPT-6.1 Sol reviewers used the complete better-writing skill independently. Round 1 yielded three parent-confirmed blockers and two optional roots; all five were addressed. Both round-2 reviewers approved the current working README, with all prior blockers resolved.
- Reviewed README blob: `03565f72cfaa1b3747a43ff95667ab00f457d2a5`. Round-2 client request IDs: `readme-writing-a-5868c81d-r2` and `readme-writing-b-5868c81d-r2`.
- Remaining non-blockers from A: README:91 could describe update-check timing more plainly; README:9 could name the image links "Tools screenshot" and "MCP screenshot". B had no actionable findings. These were left unchanged after both reviewers approved, per the requested no-blocker stopping condition.
- Direct documentation checks: 15 local links/anchors valid, three shell blocks pass bash -n, git diff --check passes.
- Repository checks ran once for this correction cycle, alongside the read-only reviews: bun test (395 passed), typecheck, lint, build (client and demo), test:e2e (185 passed, 5.2 minutes). The existing >500 kB bundle warning remains.
- Not performed: actual systemd configuration, authentication, changing real Pi settings, browser/network verification of documentation destinations, deployment or push.

---

# Verification — correct the public guides and separate demo maintenance, 2026-10-11

Scope: documentation only; no application code, service unit, dependencies or AGENTS.md changed.

- README now states the systemd prerequisite and asks you to edit the copied unit's WorkingDirectory and Bun executable path before enabling it, with journalctl as the recovery step.
- The CLI options no longer claim that --project defaults to the current directory: it adds a project to the picker; Pi sessions supply the other projects (src/server/cli.ts).
- README, SPEC.md, docs/parity.md and docs/plugin-tools.md distinguish provider credential actions from the trusted provider probe. General and Models › Defaults load enabled extensions for model metadata (GeneralTab.tsx, ModelDefaults.tsx, modelRoutes and extensionProviderSource); a subprocess is not a sandbox.
- Current task documents use Context consistently. Historical verification entries are unchanged.
- Demo maintenance commands moved from README to docs/demo.md, which links back to local setup and the demo specification.
- Source review against the better-writing skill: all five findings addressed, no remaining HIGH in the changed copy. Local checks found 18 valid file/anchor links and six shell blocks passing bash -n.
- Repository checks: bun test (395 passed), typecheck, lint, build (client and demo), and test:e2e (185 passed, 5.8 minutes). The existing >500 kB bundle warning remains.
- Not performed: enabling or restarting a systemd service, changing real Pi settings, recording new demo data, deploying or pushing. No additional manual browser check was needed because the interface and application source are unchanged.

---

# Verification — publish the static demo to Cloudflare, 2026-10-11

Demo: https://pi-settings-studio-demo.khoaphamda.workers.dev
Cloudflare version: `e4a66aa5-5e91-4844-8a67-296085f65a65` (built from `9370e55`).

- `bun run deploy:demo` rebuilt and uploaded the static assets successfully under the owner's OAuth login. No local settings backend, credentials or account token were uploaded.
- HTTPS document, CSS, app script and snapshot script return 200. CSP, nosniff, referrer policy and permissions policy match `src/demo/public/_headers`.
- Live browser verification with agent-browser (isolated session `pss-cf-live-20261011`) and T3 preview: all nine tabs open with sample data and no alerts, console errors or warnings. Only static resources were requested; no `/api/` or localhost request.
- Clicking "Enable code-review" leaves the switch enabled and shows the read-only toast. Dark mode at 390×844 has no horizontal overflow (scrollWidth 390).
- Screenshots: `/tmp/pss-live-evidence/general.png`, `context.png`, `refused-write.png`, `mobile-dark.png`; T3 captured a Context screenshot as well. These are local evidence, not shipped assets.
- README links directly to the deployed demo and distinguishes sample data from local configuration editing. GitHub's website field points to the demo.
- Application source is unchanged since the preceding verification (395 unit tests, 185 browser tests, typecheck, lint and both builds passed). This follow-up changes documentation only.
- Not checked: Firefox/Safari or slow-network performance. The existing >500 kB bundle warning remains.

---

# Verification — a static demo build that runs on Cloudflare with sample data, 2026-10-11

Scope: a hosted page cannot read `~/.pi`, and the app's server accepts only its own origin, so a link can show the app but not edit anyone's settings. `vite build --mode demo` now makes `dist/demo`: the same app with every request answered from `src/demo/snapshot.json` (168 answers, 762 kB, 60 kB gzip in its own chunk), served as static assets by a Cloudflare Worker with no script (`wrangler.jsonc`) and the same CSP and headers as the app's server (`src/demo/public/_headers`). It is not deployed yet.

- The snapshot is recorded from the real server on a sample home (`src/demo/seed.ts`: settings, three providers' worth of keys that are not keys, a custom Ollama provider, five skills, two sub-agents, a prompt, two extensions, a connecting stdio MCP server and a disabled remote one, a project with its own skill and server, one recorded session). `bun run record:demo` refuses to write when the text holds this machine's home, user name or working directory.
- `src/demo/reads.ts` lists every read the tabs make on opening (with and without the project chosen); the loaders' argument types are checked by `tsc`, and both the unit test and the browser test fail when the snapshot lacks one.
- A change is refused (`READ_ONLY`), tells the page whichever way its tab reports errors, and shows a toast with an error cue; a read the demo lacks says "not included in the demo". A note at the top says it is a read-only demo and links to the repository.
- The normal build is unchanged in behaviour: `import.meta.env.VITE_DEMO` is empty there, and its bundle holds none of the demo's strings or data.

| Check | Result |
|---|---|
| RED/GREEN | `tests/demo.test.ts` (8) failed with the module missing, then passed; `tests/demo-snapshot.test.ts` failed on an empty snapshot until the recording; `e2e/demo.spec.ts` failed on the missing note and project, then passed; the toast on refusal was added after the browser showed a switch flipping back with no word |
| Mutation | Removing the project's `code-review/SKILL.md` answer from the snapshot makes "every row of every list opens without an error" fail at Skills, row 3 (it first passed twice for the wrong reasons: a regex that missed "Edit files of", and a key without `project=`; the real run also flagged "re-reading" in a sample prompt as a loading state, so it now checks `aria-busy`) |
| `bun test` | 395 passed (54 files) |
| `bun run typecheck` / `bun run lint` | Passed |
| `bun run build` | Passed (client, then demo); the >500 kB chunk warning remains; no demo string in `dist/client` |
| `bun run test:e2e` | 185 passed (13 new in `e2e/demo.spec.ts`: the note, each of the nine tabs with no `/api` request, no console error and no alert, every row of every list, a refused change, axe on the first screen) |
| `wrangler dev` | Serves `dist/demo` with the `_headers` applied (CSP, nosniff, referrer and permissions policy seen in the response) |

Manual (agent-browser against `wrangler dev` on port 8788, own session, closed after): Skills at 1440×900 shows the note and the sample skills; clicking a switch leaves it on and shows the toast "This is a read-only demo with sample data…"; at 390×844 in dark, nothing overflows sideways (scrollWidth 390); console clean. No real file under `~/.pi` was read or written; the recorder ran on a temporary home.

Not checked: the deployed Worker (needs a Cloudflare login), Firefox and Safari, and the demo's size on a slow network (694 kB chunk, loaded after the app's own).

---

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
- The installed service has a drop-in at `~/.config/systemd/user/pi-settings-studio.service.d/tailnet.conf` (outside the repo) with `--allow-origin https://machine.tailnet.ts.net:4369`. `tailscale serve --bg --https=4369 http://127.0.0.1:4369` serves it on the tailnet only. The existing 443 route to 127.0.0.1:3773 was not changed.

| Check | Result |
|---|---|
| RED/GREEN | `tests/server.test.ts` failed with "Export named 'parseAllowedOrigin' not found", then passed (3 of 3) |
| `bun test` | 361 passed (50 files): 2 new |
| `bun run typecheck` / `bun run lint` / `bun run build` | Passed |
| `bun run test:e2e` | Run 1: 153 passed, 1 failed (`package-updates.spec.ts:44`, a strict-mode locator that matched 2 status elements; it passed alone 2 of 2). Run 2: 153 passed, 1 failed (`motion.spec.ts:73`, the flake recorded below) |
| Live, from this machine on `https://machine.tailnet.ts.net:4369` | GET 200; POST from its own origin 415 (origin accepted, nothing written); POST from `https://evil.example` 403; localhost 200; the 443 route 200. The phone itself was not tested |

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

[Showing lines 1-397 of 414 (50.0KB limit). Use offset=398 to continue.]