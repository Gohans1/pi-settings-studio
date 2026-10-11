# Pi Settings Studio

A local GUI for [Pi](https://pi.dev) core configuration: MCP servers, models, skills, packages, and an inspector that previews a new session's startup context. Settings only, no chat. Inspired by the settings panel of [pi-web](https://github.com/agegr/pi-web). Unofficial: not affiliated with Earendil Works.

[Try the demo](https://pi-settings-studio-demo.khoaphamda.workers.dev) — no installation, sample data only. To edit your own settings, [run it locally](#run).

![Context: a startup preview of Pi's system prompt and tool declarations, with token estimates](docs/screenshots/context.png)

Native Pi files stay authoritative: the app reads and writes `settings.json`, `mcp.json`, `models.json`, skills and `AGENTS.md` in place, and keeps unknown keys. More screens: [Tools](docs/screenshots/tools.png), [MCP](docs/screenshots/mcp.png).

Scope, decisions and boundaries: [SPEC.md](SPEC.md). Coverage: [docs/parity.md](docs/parity.md). Progress: [tasks/todo.md](tasks/todo.md).

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Demo

[Open the hosted demo](https://pi-settings-studio-demo.khoaphamda.workers.dev). It is read-only and cannot access your local Pi files.

For maintainers: [build, refresh and deploy the demo](docs/demo.md).

## Run

Requires [Bun](https://bun.sh) 1.4.2 or newer (tested on 1.4.2) and Pi, with `pi` on your `PATH`.

### From npm

```sh
bun x pi-settings-studio            # http://localhost:4369
```

This downloads the package and its dependencies, then runs them with your permissions; it is not a sandbox. To stay on one release, name it: `bun x pi-settings-studio@<version>`. Releases from 0.1.1 on are built by GitHub Actions and carry provenance: [check a release](docs/release.md#check-a-release).

### From source

```sh
git clone https://github.com/Gohans1/pi-settings-studio
cd pi-settings-studio
bun install --frozen-lockfile
bun run build
bun run start            # http://localhost:4369
```

### Options

Both ways accept these:
- `--port`: HTTP port (default: `4369`).
- `--agent-dir PATH`: Pi configuration folder (default: `PI_CODING_AGENT_DIR` or `~/.pi/agent`).
- `--project PATH`: add a project to the picker. Without it, projects are discovered from Pi sessions; the current directory is not added automatically.

Use a temporary `--agent-dir` while trying changes.

## Run in the background

Requires Linux with systemd, or WSL with systemd enabled, and a clone of the repository: the npm package does not include the service unit. Before enabling the service, edit the copied unit:

- Set `WorkingDirectory` to the repository's absolute path.
- Replace `/usr/local/bin/bun` in `ExecStart` with the absolute path returned by `command -v bun`.
- If Pi, its runtime or npm is installed in a user-local directory, include those bin directories in the service's `PATH`. MCP commands also need to be reachable there; a working terminal `PATH` does not guarantee the service has the same one.

For user-local installs, add this to the unit's `[Service]` section, replacing the example directories with your absolute bin paths:

```ini
Environment="PATH=/absolute/pi-bin:/absolute/runtime-bin:/absolute/npm-bin:/usr/local/bin:/usr/bin:/bin"
```

Do not use `~`, `$HOME` or `$PATH` in that value; systemd does not expand them.

```sh
bun run build
mkdir -p ~/.config/systemd/user
cp service/pi-settings-studio.service ~/.config/systemd/user/
command -v bun
# Edit ~/.config/systemd/user/pi-settings-studio.service as described above.
systemctl --user daemon-reload
systemctl --user enable --now pi-settings-studio
loginctl enable-linger "$USER"   # start with WSL, without opening a terminal
```

Then bookmark `http://localhost:4369`. If startup fails, inspect the error with `journalctl --user -u pi-settings-studio -n 50`. After pulling changes: `bun run build && systemctl --user restart pi-settings-studio`.

To open it from a phone on your tailnet, run `tailscale serve --bg --https=4369 http://127.0.0.1:4369`, then start the service with `--allow-origin https://<machine>.<tailnet>.ts.net:4369` (a systemd drop-in keeps that out of the repo). The app has no login, so anyone on that tailnet who reaches it can change settings.

## Tabs

- **General**: the `settings.json` keys no other tab owns, raw JSON, keyboard shortcuts, the installed Pi version with Update Pi and a newer Pi on npm when there is one, and what cannot be edited here.
- **Models**: Pi's model-runtime providers and `models.json` providers, with model details, credential setup, custom endpoints and model discovery. Defaults controls the startup provider/model, enabled models, thinking levels, prompt caching and thinking budgets. Models registered by enabled extensions appear in Defaults; configure their credentials in Pi.
- **Skills**: switches, whether the model may load a skill (one, or a whole group from its menu), a file editor for each skill folder, new skills, Remove with Undo, skill commands.
- **Sub-agents**: profiles in Pi's example format.
- **Plugins**: extensions, prompts and themes (switches, editor, new files), packages (check for updates, update notices, install, update, remove, filters, the npm command). Select an extension to inspect all registered tools and direct model declarations for the chosen project. Installed extensions are trusted and run automatically for this preview; see [Extension tools](docs/plugin-tools.md).
- **MCP**: servers with exposure rules, each server's state (connected, needs sign-in, failed) and tools as soon as the tab opens, OAuth and provider sign-in, Code mode, import from other clients, connection test, sign-in state, `mcp.log`.
- **Tools**: a startup preview of tools the model sees directly, can reach on demand, or cannot use. Grouped by Pi, extension and MCP sources, including disabled sources, with search. Startup tools edits Pi's default tool selection. Uses the same trusted inspection as Plugins; see [Extension tools](docs/plugin-tools.md).
- **Instructions**: `AGENTS.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`.
- **Context**: startup and recorded context, broken down into system-prompt sections and tool declarations, with Pi's token estimates and source files. **Next session** uses trusted inspection for a startup preview. **Recorded session** shows the first request Pi recorded and later context changes.

Startup previews do not run third-party turn-start or request hooks. Host or provider additions can make the actual request differ. See [preview limitations](docs/plugin-tools.md#context).

The project picker includes that project's `.pi` files and shows Pi's saved trust decision. Inspections treat the selected project as trusted without changing `trust.json`, even if Pi's saved decision rejects it. Configuration changes apply to new Pi sessions, or after `/reload`.

CLI-backed jobs use `pi` on `PATH` (or `~/.local/bin/pi`), with `PI_CODING_AGENT_DIR` set to the app's agent directory. Provider sign-in/key setup and extension inspections use the app's pinned Pi SDK, not the installed CLI.

## Package update notices

The app looks for package updates in the background, as Pi does at startup: when Plugins is listed and the last check for the current settings is missing or a day old. Pi's public checker reports which installed npm/Git packages have updates; matching rows say **Update available**, the Packages entry and the **Plugins** tab show the count. **Plugins → Packages → Check for updates** checks now. Checking does not install anything. **Update** and **Update all** still require a separate click.

The last result and timestamp are kept in `pi-settings-cache.json` beside Pi's files, so they survive reloads and restarts, and a check still running when you come back shows as checking. Settings changes and package operations invalidate those notices. A failed automatic check is not repeated within the hour. The newer Pi beside the installed one comes from `npm view` the same way, once a day; `PI_SKIP_VERSION_CHECK` turns that off. Select and trust a project to include its packages. Updates run from that project's directory when selected, following Pi's global/project rules.

The checker uses system `npm` and `git` (not `npmCommand` from settings), and Pi's existing version/range, pin and project-precedence rules. It skips local paths, exact npm pins, pinned Git refs, missing installations and failed lookups. `PI_OFFLINE` skips networking, and automatic checks with it. **“No updates reported” does not mean all packages are current:** Pi's API does not distinguish network/authentication failures or expose target version numbers. No extensions are loaded to perform the check.

## Security

- The server listens on `127.0.0.1` only, checks Host and Origin, rejects cross-site requests and has no login. Anyone who can reach it can change your Pi settings, so do not expose it beyond your machine (see the tailnet note above).
- Installing from npm runs this package and its dependencies on your machine. Provenance shows which commit and workflow built a release; it does not show that the code is harmless.
- Installed extensions are trusted, not sandboxed. Selecting an extension, or opening Tools or Context, loads extensions and connects configured MCP servers through Pi in a separate process. General and Models › Defaults also load enabled extensions in a provider-inspection process to read their model metadata. Extension code can access files and the network. [Extension inspection and side effects](docs/plugin-tools.md#trust-and-side-effects).
- Inspections can load a selected project's extensions even when Pi's saved trust decision rejects that project. Select only projects whose code you trust; inspection does not change `trust.json`.
- Secrets stay on the server: `auth.json` values and MCP `env` / `headers` values are never sent to the browser.

## Test

```sh
bun test
bun run typecheck
bun run lint
bun run build && bun run test:e2e
```

For maintainers: [release workflow and verification](docs/release.md).

## License

MIT, see [LICENSE](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
