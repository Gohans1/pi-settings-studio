# Third-party notices

## Pi (`@earendil-works/pi-coding-agent` 1.0.3, re-checked against 1.1.0)

`src/server/mcp-config.ts` ports `mcp.json` validation and edit rules from `dist/core/mcp-servers.js` and `dist/extensions/mcp/config.js`. `src/server/resources.ts` ports the resource toggles and group labels of `pi config` from `dist/modes/interactive/components/config-selector.js`. `src/server/agents.ts` reads profiles the way `examples/extensions/subagent/agents.ts` does. Ported from Pi 1.1.0 and compared with Pi in tests: `src/shared/tools.ts` (`defaultTools` resolution, `dist/core/settings-manager.js`), `src/server/model-scope.ts` (`resolveModelScopeFromModels` and helpers, `dist/core/model-resolver.js`) and `toolExposure` in `src/shared/mcp.ts` (`getMcpToolExposure`, `dist/core/mcp-servers.js`). License: MIT (per the package's `package.json`), author Mario Zechner.

## pi-web

`src/server/codemode.ts` follows the Code mode rules of pi-web's `lib/codemode-settings.ts` and `lib/powershell-settings.ts` (commit `fdeea87`). License: MIT, Copyright (c) 2026 agegr.

## shadcn/ui (Base Nova)

Every file in `src/client/components/ui` (accordion, alert, alert-dialog, badge, button, card, checkbox, collapsible, dropdown-menu, empty, field, input, input-group, item, kbd, label, radio-group, scroll-area, select, separator, spinner, switch, tabs, textarea, toast, toggle, toggle-group, tooltip) comes from the shadcn registry, base-nova style, installed or reinstalled with `shadcn@4.21.4` (the latest release) on 2026-10-08 and not edited since. `shadcn add --dry-run --diff` finds no difference beyond a `"use client"` line, which the CLI adds or drops from run to run and which a Vite app ignores. `src/client/styles.css` imports `shadcn/tailwind.css` from the `shadcn` package; `tw-animate-css` and `cn` are dependencies, and `@shadcn/lint` (Copyright (c) 2026 shadcn) a development dependency, under their own MIT licenses.

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

## Flexoki

`src/client/flexoki.css` copies colour values from [Flexoki](https://stephango.com/flexoki) (palette 2.0, `github.com/kepano/flexoki`). License: MIT, Copyright (c) 2023 Steph Ango.

Other dependencies retain their own licenses.
