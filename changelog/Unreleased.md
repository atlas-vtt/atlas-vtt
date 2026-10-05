## New

- Customize the toolbar from the command palette: drag tools to reorder them, or into the tray above it to hide them. With a contribution by oscar-eriksson

## Improved

- A scene can measure at its own scale: Distance per cell in the command palette's Grid Settings sets how far one cell of that map reaches, in place of the collection's, for the ruler and for how far lights and senses reach on it. Leave it empty to follow the collection. Contributed by ISorokaI
- Number every cell of a square grid, the same way hex grids already could. A new Letters and numbers format (A1, B1, …) is available on square and hex grids alike
- An open map uses much less graphics memory: 3D dice share one drawing context per window, and with dynamic lighting on the map no longer keeps antialiasing buffers it does not draw into
- On narrow windows, tools move into More tools from the right; the command palette always stays
- Right-click a scene in the asset manager and choose Open Scene to open it, in addition to double-clicking it. Contributed by marinojoey

## Fixed

- Grid lines no longer break up or vanish at some zoom levels after the grid size was changed. Zoomed out, a line thinner than a screen pixel is drawn one pixel wide and fainter instead. Contributed by ISorokaI
- Links in Fantasy Statblocks bestiary statblocks show as links instead of raw text such as `rules/skills.md#Perception|Perception`, and a click opens the note in a new tab. Contributed by ISorokaI
- The asset manager opens and scrolls faster with many tokens: every token card used to make the browser read the token ring image anew, which on slower computers froze the Characters tab with a few dozen tokens. Contributed by ISorokaI
- Zooming a map whose grid is switched off no longer folds the map into a grey wedge pointing at one of its pins
- Rolls show as result cards when the graphics card cannot draw 3D dice, for example after Obsidian lost or blocked WebGL, instead of an empty white panel. Contributed by ISorokaI
- Corrected the swapped export and import icons in the asset manager's collection header. Contributed by anacletoTM
- Large (2×2) and Gargantuan (4×4) tokens snap to where cells meet, so they cover whole cells: on square grids to the corners where grid lines cross, on hex grids to the corner three hexes share, so a Large creature covers 3 hexes and a Gargantuan one 12 (a Huge one stays on a hex and covers 7). This holds when you drag, place, paste or duplicate them and when an encounter spawns them, and they stay there when a scene loads or its grid is changed or aligned. Before, they snapped to the middle of a cell like Medium tokens. A token you resize keeps the cell its footprint starts from, so it stays on the grid at its new size
- The selection outline around a token follows it when the token is resized, from the resize handles or the size menu. Before, it kept the old size until the token was selected again
- Reloading Atlas no longer leaves the previous 3D dice in graphics memory
- Loading a scene with explored areas no longer keeps a copy of them in graphics memory
- The DM screen fits the map when Obsidian's sidebars are open or the map shares the window with other panes: it no longer runs off the edges, and its statblocks and note stack once the map is narrow
