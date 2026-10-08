# Design system

## Overview

Follows the shape of pi-web's settings panel, which the user already knows: a horizontal tab bar at the top, then the tab's content. List tabs (MCP, Skills, Plugins, Sub-agents) use master–detail: a grouped list with on/off switches on the left, the selected item's details on the right, stacked on narrow screens.

A dense, quiet workspace in [Flexoki](https://stephango.com/flexoki)'s ink-on-paper colours; light or dark follows the OS. No gradients, decorative metrics or icon-card grids.

## Colors

The CSS is the source of truth, in three layers that each read only the one before:

1. `src/client/flexoki.css`: Flexoki primitives (`--flexoki-*`) with upstream values, only the steps a role uses.
2. `:root` in `src/client/styles.css`: semantic tokens with shadcn names, each `light-dark(<light>, <dark>)`. Rules and components use only these.
3. `@theme inline`: the semantic tokens as Tailwind colour utilities.

Roles follow Flexoki's mapping: paper and black for the page, bg-2 for the header and wells (`--sidebar`, `--muted`), ui and ui-2 for selected rows and their hover (`--secondary`, `--secondary-hover`), ui-2 for hairlines (`--border`). Blue is the one accent (`--primary`: 600 in light, 400 in dark with black text). Red (`--destructive`) means an error or a destructive action and orange (`--warning`) a warning; neither decorates. Muted text, dark destructive and input borders sit one step stronger than Flexoki's mapping to pass WCAG AA; `tests/design-tokens.test.ts` measures every pair in both schemes. Add a primitive from the upstream tables only when a new role needs it.

## Typography

System fonts through Tailwind's `--font-sans` (Segoe UI on Windows) and `--font-mono`. Five sizes by role: caption 12px (metadata, states, code), small 13px (descriptions, tab labels), body 14px, heading 18px (every h2), display 28px (h1). Two weights: regular, and semibold for labels, item names and headings. Line heights and tracking are Tailwind's `--leading-*` and `--tracking-*`. A new `--text-*` size is also registered in `cn()` (`src/client/lib/utils.ts`), or tailwind-merge drops text colours beside it.

## Layout

Spacing uses Tailwind's 4px scale through `--spacing(n)`. Shared dimensions are tokens: `--control-height` (40px), `--header-height`, and `--header-offset`, which clears the sticky header when it wraps. A width used by one rule stays next to that rule. The 1000px and 700px breakpoints come from the content.

## Elevation & Depth

Flat. Hairlines and Flexoki's background steps separate surfaces; there are no shadows.

## Shapes

Restrained 6px corners (`--radius`) with shadcn's scale derived from it (`--radius-sm` to `--radius-xl`). Pills only for switches and section links.

## Components

shadcn (Base UI) Button, Switch and Tabs, styled by the tokens. Buttons press to 96% with a strong ease-out (`--ease-out`); transitions name the properties they animate, and reduced motion turns them off.

Switches save immediately and announce the result in a live region. Forms save on Save; a failed save keeps the draft next to the error. Destructive actions offer undo. Secret values are never displayed; fields that hold them say "value hidden" and accept a replacement.

## Do's and Don'ts

- Do use a semantic token; when no role fits, add one rather than borrowing a token for its value.
- Don't write colour literals, raw spacing or font sizes, or `!important` in `styles.css`; the design-token tests fail on them.
- Don't add `.dark` selectors or `prefers-color-scheme` blocks: `light-dark()` and Tailwind's `dark:` variant already follow the OS.
