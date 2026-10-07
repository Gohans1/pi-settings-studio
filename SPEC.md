# Specification

## Objective
Public-ready GUI for Pi configuration; all pi-web settings-management capabilities are the first completion gate, not a stretch goal. See docs/parity.md for exact baseline and uncompleted work. No chat, database, remote admin service, or bundled Pi engine.

## Contract
Use global agent directory (PI_CODING_AGENT_DIR, otherwise ~/.pi/agent) and the explicitly selected project's .pi directory. Fixed document identifiers, never arbitrary HTTP filesystem paths. Show raw scoped values and inherited values distinctly. Do not claim live/effective T3 state. Project inspection does not grant Pi trust.

Patch only explicitly edited keys. Keep unknown keys on disk without returning them indiscriminately to the browser (they can contain secrets). Reject invalid JSON without overwriting it. Preserve file content in private backups, detect stale revisions, lock with proper-lockfile as Pi does, stage writes in the same directory and rename atomically. Reject symlinked configuration targets/parents initially; report the restriction rather than follow them. Local same-user malicious processes are outside this application's sandbox guarantees.

## Local HTTP boundary
Bind 127.0.0.1 only. Random per-launch access capability in URL fragment, exchanged for an HttpOnly SameSite=Strict cookie. Check exact Host and Origin, Fetch Metadata, JSON content type, and body limit. No wildcard CORS, remote fonts, telemetry, or reflected secrets. Never log capability-bearing URLs from RPC. No shell interpolation or execution on reads. Bootstrap token is generated locally, not a provider credential.

## UI
Settings-oriented navigation; source/scope visible while editing; search descriptions and keys; beginner guidance with advanced details; review changed keys before save; discard is explicit; stale saves keep the draft. Never report a save as live reload. Keyboard and narrow-screen support. No fake operational buttons for unimplemented integrations.

## Commands
Install: bun install --frozen-lockfile --ignore-scripts
Test: bun run test (executes node --import tsx --test)
Types: bun run typecheck
Lint: bun run lint
Build: bun run build
Browser tests: bun run test:e2e
Start prebuilt app: node dist/server/cli.js

## Structure
src/server: local service and persistence; src/shared: validated contracts; src/client: UI; tests: isolated node:test fixtures; e2e: browser flows; docs: parity, threat model, verification; tasks: plan and status.

## Style
ES modules, TypeScript strict mode, named functions, two-space indentation. Boundary validation returns actionable errors, never filesystem stacks. Example: `const scope = z.enum(['global', 'project']).parse(input);`.

## Verification
RED → GREEN → refactor for every behavioral slice. Temporary agent/project roots only. Test malformed data, concurrent edits, symlinks, invalid requests, unauthenticated access, backup restoration. Real browser save/reload, keyboard, responsive and accessibility tests. Pack/install smoke test with prebuilt assets and no install-time build. No real config or credentials in tests.

## Boundaries
Always: preserve unknown values, use public APIs, verify installed declarations and official docs, record unsupported features.
Ask first: publishing, uploading user config, relaxing security, changing AGENTS.md, executing untrusted installed integrations.
Never: private Pi dist imports in shipping code, silently overwrite concurrent changes, promise untested compatibility, describe pending parity as finished.
