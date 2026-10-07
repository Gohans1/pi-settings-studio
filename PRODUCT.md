# Pi Settings Studio
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
User-approved: React, TypeScript, Vite, shadcn/ui (Base UI), Tailwind CSS 4; Node-compatible Hono server, Zod, node:test and Playwright. Bun is development tooling, not a runtime requirement.

## Users
Pi users who prefer a GUI, from beginners to power users. Must work alongside T3Code without replacing its chat or orchestration.

## Product Purpose
Manage Pi configuration through understandable forms. First cover pi-web settings-management parity, then remaining Pi core configuration. Native Pi files remain authoritative.

## Operating Context
Server runs where Pi's configuration lives; browser may be in Windows while Pi runs in WSL. No machine-specific paths in shipped code. A saved file is not proof of an updated live session.

## Capabilities and Constraints
Track unfinished parity explicitly. Never claim live T3 prompt fidelity from a filesystem preview. Public npm/Pi package with prebuilt assets and an on-demand launcher. Do not publish without explicit authorization. Never execute configuration just to display it.

## Open Decisions
Package name is provisional, npm availability/reservation and publishing identity are unconfirmed. License must be confirmed before public release. No unverified platform support claims.
