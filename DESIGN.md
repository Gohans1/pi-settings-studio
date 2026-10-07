# Design system

Follows the shape of pi-web's settings panel, which the user already knows: a horizontal tab bar at the top, then the tab's content. List tabs (MCP, Skills, Plugins, Sub-agents) use master–detail: a grouped list with on/off switches on the left, the selected item's details on the right, stacked on narrow screens.

Neutral workspace, light/dark from the OS, restrained 6px corners and hairlines, system UI typography. No gradients, decorative metrics or icon-card grids.

Switches save immediately and announce the result in a live region. Forms save on Save; a failed save keeps the draft next to the error. Destructive actions offer undo. Secret values are never displayed; fields that hold them say "value hidden" and accept a replacement.
