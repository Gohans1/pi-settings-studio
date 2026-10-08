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

The tokens carry shadcn's names, so its components read Flexoki without a change to their source. Roles follow Flexoki's mapping: paper and black for the page; bg-2 for the header, the list pane and callouts (`--sidebar`, `--card`); ui for hovers and highlights (`--muted` under ghost buttons, `--accent` under menu and select items, `--secondary`); ui-2 for the chosen row (`--selected`) and hairlines (`--border`). Blue is the one accent (`--primary`: 700 in light, 300 in dark with black text). Red (`--destructive`) means an error or a destructive action, orange (`--warning`) a warning and green (`--success`, Flexoki's 600 in light and 400 in dark) a provider that is ready to use; none decorates. Orange and green colour icons beside words, so they are measured at 3:1. Floating layers (menus, selects, toasts) sit on `--popover` with shadcn's own shadows.

Muted text, dark destructive, input borders and the primary blue sit one step stronger than Flexoki's mapping to pass WCAG AA; the blue so that text keeps 4.5:1 under the Button's 80% hover. `tests/design-tokens.test.ts` measures every pair in both schemes, the hovered button included. `prefers-contrast: more` turns hairlines into input borders and muted text into body text. Add a primitive from the upstream tables only when a new role needs it.

## Typography

System fonts through Tailwind's `--font-sans` (Segoe UI on Windows) and `--font-mono` for paths, keys, code and file contents. shadcn's components size their own text with Tailwind's scale (`text-sm`, `text-xs`; inputs are 16px on small screens so iOS does not zoom). The app's own text uses five sizes by role from `:root`: caption 12px (metadata, counts, code), small 13px (list group names, file paths), body 14px, heading 18px (every h2), display 24px (h1). They stay out of `@theme` on purpose: as `text-*` utilities, `cn` would read them as colours and drop one of a pair. Headings are semibold, labels and buttons medium. Headings balance their lines, descriptions use `text-wrap: pretty`, counts use tabular figures.

## Layout

Spacing uses Tailwind's 4px scale through `--spacing(n)`. Controls take shadcn's sizes (32px inputs, selects and default buttons). Shared dimensions are tokens: `--gutter`, `--page-width` and `--list-width`. A width used by one rule stays next to that rule. The 56rem breakpoint is where the workbench stops fitting two panes, 40rem where page actions take the full width; a setting row stacks by its own container's width (`@container`).

Pages open with `PageHeader`: the title, one line on what the page edits, the files it writes (`FilePath`, home-relative), and the page's own actions on the right.

## Elevation & Depth

Flat. Hairlines and Flexoki's background steps separate surfaces. Only floating layers cast a shadow.

## Shapes

Restrained 6px corners (`--radius`) with shadcn's full scale derived from it. The workbench frame's corner is its inset row's corner plus the inset (`--radius-frame`). Pills for switches, badges and the narrow-screen section chips.

## Components

Every control is a shadcn (Base UI, base-nova) component in `src/client/components/ui`, installed with the shadcn CLI and kept as the registry ships it, so `shadcn add <name> --overwrite` updates it. An instance changes through its props, its variants or a `className`; the tokens change the look everywhere. Where shadcn has nothing, the app composes its components rather than building one:

- `OptionSelect`: a Select built from `{ value, label }` options (Base UI's typed-wrapper pattern).
- `Disclosure`: a Collapsible behind a ghost Button with a turning chevron, as in shadcn's example.
- `ScopeChoice`: the RadioGroup that picks the global or the project's file.
- `ListItem`, `EmptyDetail`, `MoreMenu` (`Workbench.tsx`): an Item as a list row, an Empty for the unchosen detail pane, a DropdownMenu for a group's other actions.
- `SearchField`: an InputGroup with a Kbd hint; the page's main one answers to "/".
- `Feedback`: keeps the tabs' message state and shows it through the Toaster's toast manager.

Free text with suggestions (default provider and model, model IDs) is an Input with a `datalist`: shadcn has no autocomplete, and its Combobox does not accept free text.

- **Buttons**: default for page and form actions, `sm` in toolbars, `xs` inside rows, `icon-xs` for list-header actions (always with an `aria-label`). One filled button per view.
- **Lists**: rows are `ListItem`s, pressed buttons that choose the detail; a switch beside a row saves at once. Group headers hold the count and the group's actions: a `+` for the common one, a `…` menu for the rest. A group's name is body size, semibold and in the body colour, and row names are regular weight, so each group reads above its rows. A ready row carries a green check before its state; a row with nothing set up is `quiet` (muted until hovered or chosen).
- **Details**: a header with the item's name and its actions, then a definition list. Where an item's state decides what the reader does next (a provider: ready or not set up), an outline Badge beside the name says it and is the region's description.
- **Forms**: Field, FieldLabel, FieldDescription and FieldError around Input, Textarea, Select, Checkbox, RadioGroup and Switch; a description is tied to its control with `aria-describedby`. The save row is sticky at the bottom of the pane (`.form-actions`). Save is never disabled for an invalid value: it takes the reader to the field and writes nothing.
- **Callouts**: an Alert. Its default role is `alert`, so a note that is part of the page passes `role="note"` and only an outcome the reader should hear now keeps `alert`. Errors are destructive with an icon and offer the recovery as a button; warnings carry a warning icon.
- **Feedback**: confirmations are toasts in Base UI's polite "Notifications" region. A toast stays until closed or replaced (its close button shows on hover, focus or F6) and carries Undo for destructive actions.
- **General**: the section index follows the reader and shows, per group, how many keys the file sets or a dot for unsaved edits. Rows at Pi's default stay quiet; a set row says so and offers "Use default". Unsaved changes keep a sticky bar with Discard and Save.
- **Warnings**: a value Pi may not accept, or that the app cannot check (a provider from an extension, a default outside Enabled models), gets `.field-warning` under its field: the icon in the warning tone, the text in the body colour, linked with `aria-describedby`.
- **Checklists**: a list setting with a known vocabulary (startup tools) is checkboxes with each item's purpose, never syntax to type.

Secret values are never displayed; fields that hold them say "value hidden" and accept a replacement.

## Motion

Components move as shadcn ships them: menus and selects fade and zoom from their trigger (tw-animate-css), accordions open to their height, toasts slide in and stack, buttons press down a pixel, disclosure chevrons turn. The app's own motion, the save bar rising into place and the loading text fading in, uses the strong ease-out (`--ease-out`) and names the properties it animates. Reduced motion shortens every transition to 0.01ms, so end events still fire; an OS theme switch holds transitions for one frame (`main.tsx`).

## Do's and Don'ts

- Do use a semantic token; when no role fits, add one rather than borrowing a token for its value.
- Do keep the visible label inside the accessible name ("Use default for Shell", not "Reset Shell").
- Do give every state a word or an icon as well as a colour.
- Don't edit files in `components/ui`; reinstall them with the shadcn CLI and change an instance through props, variants or `className`.
- Don't write colour literals, raw spacing or font sizes, or `!important` in `styles.css`; the design-token tests fail on them.
- Don't add `.dark` selectors or `prefers-color-scheme` blocks: `light-dark()` and Tailwind's `dark:` variant already follow the OS.
- Don't override a component's utilities from `styles.css`: app layout lives in `@layer components` and may place a component (`[data-slot=alert]` margins), but a component's own look lives in its source.
