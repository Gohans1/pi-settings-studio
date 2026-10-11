# npm releases

The release workflow is [.github/workflows/release.yml](../.github/workflows/release.yml). It runs on GitHub-hosted Ubuntu 24.04 with Bun 1.4.2. Node 24.21.0 supplies npm for OIDC publishing; the app still runs with Bun.

## What is tested and published

1. Install the committed lockfile, then run unit tests, typecheck, lint, both builds and the Chromium E2E suite.
2. Pack once without rerunning build scripts. Reject unexpected paths, links, consumer install hooks, changed metadata or changed server/shared source. Check that built HTML references assets in the archive.
3. Install that exact tarball into a temporary consumer with an empty home, without installation scripts. Audit its production dependency tree with no exceptions. Check the installed CLI, HTML, JavaScript, security headers and settings API.
4. Upload the tarball, SHA-256 checksum, package information and unfiltered development audit report as an immutable Actions artifact.
5. The main-only `npm` environment requires release approval. Its staging job downloads that run's artifact, verifies the checksum and compares source/metadata against a fresh checkout. It neither installs project dependencies nor rebuilds the app.
6. `npm stage publish <tarball> --provenance` uses npm Trusted Publishing/OIDC. The publisher is allowed to **stage only**, not publish directly. A maintainer reviews the stage and approves it with npm 2FA.

Actions are pinned to full commit SHAs. Build jobs have no OIDC publishing permission; the staging job has only `contents: read` and `id-token: write`. No long-lived npm token is stored in GitHub.

## Accepted development advisory

On 2026-10-11 the maintainer explicitly authorized release with [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `braces@3.0.3` can exhaust the stack when processing deeply nested patterns. The dependency comes through the development-only shadcn CLI. At that check, npm had no published patched version.

The package is retained because the client build imports `shadcn/tailwind.css`. The CLI and its dependency tree are not shipped as runtime dependencies; the generated CSS is in the built client. This is an accepted exception, **not a fixed vulnerability or a clean full-project audit**.

The unfiltered development report remains in the release artifact. The development gate excludes this specific advisory only; any other High/Critical finding fails. The isolated production installation is audited without exclusions. Revisit this exception when upstream publishes a fix.

## First-package bootstrap

npm requires the package to exist before configuring its trusted publisher. Staging a new package creates a public `0.0.0-stage` placeholder; it does not publish the app version.

Use the GitHub-tested tarball to create the first local stage. Configure the trusted publisher for `Gohans1/pi-settings-studio`, workflow `release.yml`, environment `npm`, with stage permission only. Reject the bootstrap stage; **do not approve it**, because a local upload does not have GitHub OIDC provenance and approving it publishes that version without it, as happened with 0.1.0 (see below). Then allow the workflow's staging job to upload the same tested artifact with provenance and review that new stage.

Staging, trusted-publisher setup, rejection and approval use npm's documented commands. The maintainer completes any security-key confirmation personally. Never use a bypass-2FA token or recovery code for routine releases.

## Release history

- **0.1.0** (2026-10-11): the bootstrap stage was approved instead of rejected, so this version went public from the maintainer's machine without provenance. Its bytes are identical to the artifact of workflow run 38158093135 (commit 836ddb9, SHA-256 `dea05719b4b44c0f07dfcb9a58e89ef30f18f66bac4e4388ce6fb76788d6ac83`), which passed the same checks. A published version cannot be replaced, so provenance starts with the next release.

## Check a release

- On npm, open the exact version's provenance details: source commit, workflow/run, build environment and public ledger.
- Compare the downloaded registry tarball's SHA-256 with the workflow artifact's `SHA256SUMS`. npm's `dist.integrity` is a separate SHA-512 integrity value.
- The `v<version>` Git tag identifies that release's source commit. Do not move an existing release tag.
- `npm audit signatures` can check registry signatures/provenance in a compatible installed dependency tree; it is not a malware scan or an audit of the entire Bun cache.

Provenance proves origin and integrity, not that code is harmless. File/source checks are packaging guards, not a complete secret or dependency-source audit. Consumers resolve transitive dependencies when installing; the repository's build lockfile does not lock every consumer's tree.

Official references: [Trusted Publishing](https://docs.npmjs.com/trusted-publishers), [staged publishing](https://docs.npmjs.com/staged-publishing), [npm trust](https://docs.npmjs.com/cli/v12/commands/npm-trust), [viewing provenance](https://docs.npmjs.com/viewing-package-provenance).
