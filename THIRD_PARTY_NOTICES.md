# Third-party notices

## Pi (`@earendil-works/pi-coding-agent` 1.0.3)

`src/server/mcp-config.ts` ports `mcp.json` validation and edit rules from `dist/core/mcp-servers.js` and `dist/extensions/mcp/config.js`. `src/server/resources.ts` ports the resource toggles and group labels of `pi config` from `dist/modes/interactive/components/config-selector.js`. `src/server/agents.ts` reads profiles the way `examples/extensions/subagent/agents.ts` does. License: MIT (per the package's `package.json`), author Mario Zechner.

## pi-web

`src/server/codemode.ts` follows the Code mode rules of pi-web's `lib/codemode-settings.ts` and `lib/powershell-settings.ts` (commit `fdeea87`). License: MIT, Copyright (c) 2026 agegr.

## shadcn/ui (Base Nova)

`src/client/components/ui/button.tsx`, `tabs.tsx` and `switch.tsx` come from the shadcn registry (base-nova style, retrieved 2026-10-07; `cn` import pointed at `@/lib/utils`). The `data-horizontal`/`data-vertical` custom variants in `src/client/styles.css` come from `shadcn@4.21.4` `dist/tailwind.css`.

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Other dependencies retain their own licenses.
