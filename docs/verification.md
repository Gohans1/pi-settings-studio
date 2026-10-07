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
