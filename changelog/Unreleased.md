## New

- Grids fit maps whose hexes or squares are printed a little stretched: Atlas draws such a map slightly wider or taller, so that its cells are regular
- Scans of printed maps that lie a little askew are turned level, so that the grid fits them
- Walls, tokens, lights, fog and everything else on a map stay on their place on it when an alignment stretches or turns the map
- A grid you measure or place by hand is fitted exactly to the lines printed on the map
- Grid alignment has its own choice of squares, pointy hexes or flat hexes
- A new scene whose map shows no grid says so and offers to align it
- Show current map in local player window opens the player window on this computer with the active map, also while another plugin shows the scene to your players

## Improved

- Measuring a hex grid works with any two corners of a hex, and one measurement is enough on most maps
- Auto-detect finds grids under terrain icons, grids with thick lines, grids drawn only on a dungeon's floors and small cells on large maps
- A detected grid shows over the whole map and can be nudged with the arrow keys before it is applied

## Fixed

- Auto-detect finds the grid of hex maps with stretched hexes, where it reported no grid
- Measuring a pointy hex grid no longer gives huge flat hexes when the corners to the left and right of a hex are clicked
- Auto-detect no longer takes a grid for several times its cell size on some maps
- Applying a grid alignment is one undo step
- Grid alignment ends when another scene is opened, and no longer applies one scene's grid to another
- Sending a map to players while another plugin shows it to them no longer says that the player view shows it when no player window is open
