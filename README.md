# Pi Settings Studio

A local, settings-only GUI for Pi core configuration, used next to T3Code. Inspired by the settings panel of [pi-web](https://github.com/agegr/pi-web), without chat. Personal tool, not published.

Scope, decisions and boundaries: [SPEC.md](SPEC.md). Coverage: [docs/parity.md](docs/parity.md). Progress: [tasks/todo.md](tasks/todo.md).

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Run

Requires Bun 1.4.2.

```sh
bun install --frozen-lockfile
bun run build
bun run start            # http://localhost:4369
```

Options: `--port`, `--agent-dir` (default `PI_CODING_AGENT_DIR` or `~/.pi/agent`), `--project` (default: current directory). Use a temporary `--agent-dir` while trying changes.

## Run in the background

```sh
bun run build
mkdir -p ~/.config/systemd/user
cp service/pi-settings-studio.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now pi-settings-studio
loginctl enable-linger "$USER"   # start with WSL, without opening a terminal
```

Then bookmark `http://localhost:4369`. After pulling changes: `bun run build && systemctl --user restart pi-settings-studio`.

## Tabs

- **General**: every documented `settings.json` key, raw JSON, keyboard shortcuts, the installed Pi version with Update Pi, and what cannot be edited here.
- **Models**: providers, keys, sign-in, credential check, defaults, custom providers in `models.json` with model lists from their endpoint.
- **Skills**: switches, a file editor for each skill folder, new skills.
- **Sub-agents**: profiles in Pi's example format.
- **Plugins**: extensions, prompts and themes (switches, editor, new files), packages (check for updates, update notices, install, update, remove, filters).
- **MCP**: servers with exposure rules, OAuth and provider sign-in, Code mode, import from other clients, connection test, sign-in state, `mcp.log`.
- **Instructions**: `AGENTS.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`.
- **System prompt**: what Pi recorded in a session.

The project picker adds each project's `.pi` files and trust. Changes apply to new T3Code threads, or after `/reload`.

Buttons that run something use the `pi` command on `PATH` (or `~/.local/bin/pi`) with `PI_CODING_AGENT_DIR` set to the app's agent directory.

## Package update notices

Open **Plugins → Packages → Check for updates**. Pi's public checker reports which installed npm/Git packages have updates; matching rows say **Update available**, and the Packages entry shows the count. Checking does not install anything. **Update** and **Update all** still require a separate click.

Checks are on demand, not a background timer. The last result and timestamp survive navigation/reloads while the server runs. Settings changes and package operations invalidate those notices; check again after updating. Select and trust a project to include its packages. Updates run from that project's directory when selected, following Pi's global/project rules.

The checker uses system `npm` and `git` (not `npmCommand` from settings), and Pi's existing version/range, pin and project-precedence rules. It skips local paths, exact npm pins, pinned Git refs, missing installations and failed lookups. `PI_OFFLINE` skips networking. **“No updates reported” does not mean all packages are current:** Pi's API does not distinguish network/authentication failures or expose target version numbers. No extensions are loaded to perform the check.

## Test

```sh
bun test
bun run typecheck
bun run lint
bun run build && bun run test:e2e
```
