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

Not verified yet: systemd is not running in this WSL distro until WSL restarts once.

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

General (every documented `settings.json` key, raw JSON, keyboard shortcuts), Models (providers, keys, sign-in, defaults, `models.json`), Skills, Sub-agents, Plugins (switches, install/update/remove), MCP (servers, Code mode, test, sign-in), Instructions (`AGENTS.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`) and System prompt. The project picker adds each project's `.pi` files and trust. Changes apply to new T3Code threads, or after `/reload`.

Buttons that run something use the `pi` command on `PATH` (or `~/.local/bin/pi`) with `PI_CODING_AGENT_DIR` set to the app's agent directory.

## Test

```sh
bun test
bun run typecheck
bun run lint
bun run build && bun run test:e2e
```
