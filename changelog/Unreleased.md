## New

- Customize the toolbar from the command palette: drag tools to reorder them, or into the tray above it to hide them. With a contribution by oscar-eriksson

## Improved

- Number every cell of a square grid, the same way hex grids already could. A new Letters and numbers format (A1, B1, …) is available on square and hex grids alike
- An open map uses much less graphics memory: 3D dice share one drawing context per window, and with dynamic lighting on the map no longer keeps antialiasing buffers it does not draw into
- On narrow windows, tools move into More tools from the right; the command palette always stays

## Fixed

- Zooming a map whose grid is switched off no longer folds the map into a grey wedge pointing at one of its pins
- Rolls show as result cards when the graphics card cannot draw 3D dice, for example after Obsidian lost or blocked WebGL, instead of an empty white panel. Contributed by ISorokaI
- Corrected the swapped export and import icons in the asset manager's collection header. Contributed by anacletoTM
- Large (2×2) and Gargantuan (4×4) tokens snap to where cells meet, so they cover whole cells: on square grids to the corners where grid lines cross, on hex grids to the corner three hexes share, so a Large creature covers 3 hexes and a Gargantuan one 12 (a Huge one stays on a hex and covers 7). This holds when you drag, place, paste or duplicate them and when an encounter spawns them, and they stay there when a scene loads or its grid is changed or aligned. Before, they snapped to the middle of a cell like Medium tokens. A token you resize keeps the cell its footprint starts from, so it stays on the grid at its new size
- The selection outline around a token follows it when the token is resized, from the resize handles or the size menu. Before, it kept the old size until the token was selected again
- Reloading Atlas no longer leaves the previous 3D dice in graphics memory
- Loading a scene with explored areas no longer keeps a copy of them in graphics memory
- The DM screen fits the map when Obsidian's sidebars are open or the map shares the window with other panes: it no longer runs off the edges, and its statblocks and note stack once the map is narrow
