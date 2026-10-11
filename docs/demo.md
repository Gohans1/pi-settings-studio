# Demo maintenance

Hosted demo: https://pi-settings-studio-demo.khoaphamda.workers.dev

This guide is for maintainers. The demo uses sample data, refuses changes and cannot access anyone's local Pi files. To edit real settings, [run the app locally](../README.md#run).

Run these commands from the repository root after installing its dependencies.

## Build and preview

```sh
bun run build:demo
bun x wrangler dev --port 8788
```

Open `http://localhost:8788`. The build writes static files to `dist/demo`; it does not run the local settings backend. Wrangler serves them using `wrangler.jsonc` and the security headers in `src/demo/public/_headers`.

## Refresh the sample data

```sh
bun run record:demo
```

The recorder starts the real app server against a temporary sample home, populated by `src/demo/seed.ts`, and writes API responses to `src/demo/snapshot.json`. It replaces local paths with demo paths and rejects a recording that still contains the recording machine's home, username or working directory.

Edit `src/demo/seed.ts` to change the sample configuration. Add new demo reads to `src/demo/reads.ts` when the UI starts requesting data not already recorded. Review the resulting snapshot before committing it, and use sample data only, never real credentials.

## Deploy

A Cloudflare account is required. Sign in once, then build and deploy:

```sh
bun x wrangler login
bun run deploy:demo
```

Wrangler uploads only `dist/demo` as static assets to `pi-settings-studio-demo`. The Bun settings backend stays local. Use the deployment URL Wrangler prints to verify the sample data, read-only notice and refused changes.

For the demo's request handling and build boundaries, see [the demo specification](../SPEC.md#demo).
