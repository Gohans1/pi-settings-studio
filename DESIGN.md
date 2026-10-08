# Design system

## Overview

Follows the shape of pi-web's settings panel, which the user already knows: a horizontal tab bar, then the tab's content. The header has two deliberate rows: the π wordmark and the project picker, then the tabs. `main` is the one scroller, so the header never moves.

List tabs (MCP, Models, Skills, Sub-agents, Plugins, Instructions) share a workbench (`Workbench.tsx`): the list on the left, the chosen item's details on the right, each pane scrolling on its own inside one framed split view. Settings that are not list items sit pinned at the top of the list (Code mode, Defaults, Packages, Folders). Below 56rem the panes take turns: the list, then the chosen item with a way back. General is one long form with a section index beside it.

A dense, quiet workspace in [Flexoki](https://stephango.com/flexoki)'s ink-on-paper colours; light or dark follows the OS. No gradients, decorative metrics or icon-card grids.

## Colors

The CSS is the source of truth, in three layers that each read only the one before:

1. `src/client/flexoki.css`: Flexoki primitives (`--flexoki-*`) with upstream values, only the steps a role uses.
2. `:root` in `src/client/styles.css`: semantic tokens with shadcn names, each `light-dark(<light>, <dark>)`. Rules and components use only these.
3. `@theme inline`: the semantic tokens as Tailwind colour utilities.

Roles follow Flexoki's mapping: paper and black for the page, bg-2 for the header, the list pane and wells (`--sidebar`, `--muted`), ui for hover (`--secondary`), ui-2 for the chosen row (`--selected`) and hairlines (`--border`). Blue is the one accent (`--primary`: 600 in light, 400 in dark with black text). Red (`--destructive`) means an error or a destructive action, orange (`--warning`) a warning and green (`--success`, icons only) a good state; each has a `-surface` for its callout. None decorates. The toast is ink on paper, inverted from the page (`--inverse*`). Floating layers (menus, the toast) use `--popover` and one soft shadow (`--shadow-popover`, transparent in dark, where the lighter surface and hairline carry the lift).

Muted text, dark destructive and input borders sit one step stronger than Flexoki's mapping to pass WCAG AA; `tests/design-tokens.test.ts` measures every pair in both schemes. `prefers-contrast: more` turns hairlines into input borders and muted text into body text. Add a primitive from the upstream tables only when a new role needs it.

## Typography

System fonts through Tailwind's `--font-sans` (Segoe UI on Windows) and `--font-mono` for paths, keys, code and file contents. Five sizes by role: caption 12px (metadata, counts, code), small 13px (descriptions, tab labels, list group names), body 14px, heading 18px (every h2), display 24px (h1). Two weights for text: regular, and semibold for labels, headings and pinned rows; buttons and tabs use medium. Headings balance their lines, descriptions use `text-wrap: pretty`, counts use tabular figures. Touch screens get 16px inputs so iOS does not zoom. A new `--text-*` size is also registered in `cn()` (`src/client/lib/utils.ts`), or tailwind-merge drops text colours beside it.

## Layout

Spacing uses Tailwind's 4px scale through `--spacing(n)`. Shared dimensions are tokens: `--control-height` (36px, inputs and default buttons alike), `--gutter`, `--page-width` and `--list-width`. A width used by one rule stays next to that rule. The 56rem breakpoint is where the workbench stops fitting two panes, 40rem where page actions take the full width; a setting row stacks by its own container's width (`@container`).

Pages open with `PageHeader`: the title, one line on what the page edits, the files it writes (`FilePath`, home-relative), and the page's own actions on the right.

## Elevation & Depth

Flat. Hairlines and Flexoki's background steps separate surfaces. Only floating layers cast a shadow.

## Shapes

Restrained 6px corners (`--radius`) with shadcn's scale derived from it. A frame's corner is its inset row's corner plus the inset (`--radius-frame`), so the workbench, menus and the toast stay concentric with their contents. Pills only for switches and the narrow-screen section chips.

## Components

shadcn (Base UI) Button, Switch, Tabs and Menu, styled by the tokens. Button sizes: default for page and form actions, `sm` in toolbars, `xs` inside rows, `icon-xs` for list-header actions (always with an `aria-label`). One filled button per view.

- **Lists**: rows are buttons with `aria-pressed`; a switch beside a row saves at once. Group headers hold the count and the group's actions: a `+` for the common one, a `…` menu (`MoreMenu`) for the rest.
- **Details**: a header with the item's name and its actions, then a definition list.
- **Forms**: fields stack with their hints; the save row is sticky at the bottom of the pane (`.form-actions`). Save is never disabled for an invalid value: it takes the reader to the field and writes nothing.
- **Feedback**: confirmations are a toast (`Feedback.tsx`) in an always-present polite live region. It stays until dismissed or replaced and carries Undo for destructive actions. Errors are callouts beside what failed, with the recovery as a button.
- **General**: the section index follows the reader and shows, per group, how many keys the file sets or a dot for unsaved edits. Rows at Pi's default stay quiet; a set row says so and offers "Use default". Unsaved changes keep a sticky bar with Discard and Save.
- **Search**: `SearchField`; the page's main one answers to "/".
- **Warnings**: a value Pi may not accept, or that the app cannot check (a provider from an extension, a default outside Enabled models), gets `.field-warning` under its field: the icon in the warning tone, the text in the body colour, linked with `aria-describedby`.
- **Checklists**: a list setting with a known vocabulary (startup tools) is checkboxes with each item's purpose, never syntax to type.

Secret values are never displayed; fields that hold them say "value hidden" and accept a replacement.

## Motion

Only where it explains a change: buttons press to 96% (150ms), menus grow from their trigger (scale 0.97, 150ms), the toast and the save bar rise 8–12px into place (200–220ms), disclosure chevrons turn. All use the strong ease-out (`--ease-out`) and name the properties they animate. Tab switches, row selection and hovers are instant. Reduced motion shortens every transition to 0.01ms, so end events still fire; an OS theme switch holds transitions for one frame (`main.tsx`).

## Do's and Don'ts

- Do use a semantic token; when no role fits, add one rather than borrowing a token for its value.
- Do keep the visible label inside the accessible name ("Use default for Shell", not "Reset Shell").
- Do give every state a word or an icon as well as a colour.
- Don't write colour literals, raw spacing or font sizes, or `!important` in `styles.css`; the design-token tests fail on them.
- Don't add `.dark` selectors or `prefers-color-scheme` blocks: `light-dark()` and Tailwind's `dark:` variant already follow the OS.
- Don't override a component's utilities from `styles.css`: element defaults live in `@layer base`, app classes in `@layer components`, and a component's own look lives in its source.
