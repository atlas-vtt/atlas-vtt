## New

- Grids fit maps whose hexes or squares are printed a little stretched: Atlas draws such a map slightly wider or taller, so that its cells are regular
- Scans of printed maps that lie a little askew are turned level, so that the grid fits them
- A grid you measure or place by hand is fitted exactly to the lines printed on the map
- Grid alignment has its own choice of squares, pointy hexes or flat hexes
- A new scene whose map shows no grid says so and offers to align it

## Improved

- Measuring a hex grid works with any two corners of a hex, and one measurement is enough on most maps
- Auto-detect finds grids under terrain icons, grids with thick lines, grids drawn only on a dungeon's floors and small cells on large maps
- A detected grid shows over the whole map and can be nudged with the arrow keys before it is applied

## Fixed

- Auto-detect finds the grid of hex maps with stretched hexes, where it reported no grid
- Measuring a pointy hex grid no longer gives huge flat hexes when the corners to the left and right of a hex are clicked
- Auto-detect no longer takes a grid for several times its cell size on some maps
