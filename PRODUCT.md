# Pi Settings Studio
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React, TypeScript, Vite, shadcn/ui (Base UI), Tailwind CSS 4 for the UI. Hono on Bun for the local server, Zod for validation, `bun test` and Playwright for tests. The Pi SDK supplies Pi's own logic.

## Users
One developer who uses Pi through T3Code (sometimes in a terminal) and prefers a GUI over editing JSON or running CLI commands.

## Product Purpose
Change Pi core configuration from a browser tab: MCP servers, system prompt inspection, skills, core settings, models, packages and sub-agent profiles. Native Pi files stay authoritative.

## Operating Context
Runs in WSL beside Pi and T3Code, always on at `http://localhost:4369`, opened from a bookmark in the Windows browser. A saved file is not proof that a running T3Code thread uses it.

## Capabilities and Constraints
Personal use; not published. Track feature coverage against pi-web's settings panel in docs/parity.md. Never execute configuration to display it. Never send secrets to the browser.
