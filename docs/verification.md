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
