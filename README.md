# Pi Settings Studio

**Development preview. Not yet pi-web feature parity or ready for public release.**

A local, native-file settings GUI for Pi. The server runs beside Pi; the browser is only the interface. There is no second chat engine, database or config mirror.

## Implemented

- Model provider/ID defaults, thinking level and enabled-model patterns.
- Startup tool selection and codemode exposure/inline budget.
- Global and project scope, inherited values, searchable keys and explanatory help.
- Review before saving, discard, concurrent-edit detection and restore of the latest backup.
- Preservation of unknown JSON keys; unknown keys are not returned to the browser.
- Loopback-only authenticated server, exact Host/Origin checks, bounded JSON requests, private file writes.
- Keyboard-accessible responsive UI with light/dark CSS themes.

**Not implemented yet:** provider catalogue/login/OAuth, custom model/provider management, MCP management, skills, packages, subagent profiles, system-prompt viewer, Pi extension launcher and remaining core settings. See [the coverage ledger](docs/parity.md) and [task list](tasks/todo.md). Development snapshots do not redefine the required scope.

## Run a development checkout

Requires Node.js 22.12 or newer. Development tooling is pinned to Bun 1.4.2. End users of a built tarball do not need Bun.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build
node dist/server/cli.js --agent-dir /path/to/test-agent --project /path/to/test-project
```

Open the private local link printed by the CLI. The link expires after 10 minutes; authenticated access lasts at most 8 hours. Restart the CLI for a fresh link. Stop with Ctrl+C.

Omitting `--agent-dir` uses `PI_CODING_AGENT_DIR` or `~/.pi/agent`. Omitting `--project` uses the current directory. **Use isolated copies while evaluating this preview.** Do not forward the server to a public interface or proxy it through a shared service.

There is deliberately no `/settings-studio` Pi command yet. Installing this snapshot into Pi will not provide an extension launcher.

## Test

```sh
bun run test          # Node's test runner; isolated temporary files
bun run typecheck
bun run lint
bun run build
bunx --no-install playwright install chromium
bun run test:e2e
bun audit
```

Tested locally: Linux/WSL, Node 22.22.1, Chromium. Windows and macOS support has not been verified. The current field catalogue is grounded in Pi 1.0.3 documentation; Pi 1.0.4 was the registry stable version inspected, not a completed compatibility test.

## File safety and limitations

Files remain authoritative. Writes use Pi-compatible `proper-lockfile` locks, a SHA-256 revision check and same-directory staged rename. The last original file is kept as `settings.json.pi-settings-backup` with private permissions. Restore swaps the previous file and backup after explicit confirmation. This is a one-generation undo, not a permanent history. The first creation of a file has no prior backup.

Malformed JSON is not overwritten. Symlinked configuration paths are refused rather than followed. This restriction is visible, not silently worked around. The service is not a sandbox against malicious same-user processes. A non-cooperating editor can still race a final filesystem check; a true cross-process transaction requires all writers to respect the shared lock.

Project inspection does not grant Pi trust. The UI shows persisted files, not actual live T3Code state. Reloading Pi or creating a session may be required. Unsupported keys stay on disk unchanged.

## Distribution

`package.json` is private while implementation is incomplete. No npm/GitHub release has been made; publishing name, license and platform guarantees remain unconfirmed. Build output is packaged, not compiled during consumer installation. Third-party component notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
