import type { DungeonFloor } from '../model';
import { doorCells, floorCellsOf } from '../geometry';
import { pointsBounds, unionBounds, type Bounds } from '../render/geometry';
import { MAP_MARGIN_CELLS } from '../render/layoutSize';
import { wayExtent, type WayOut } from '../render/cave/mouth/wayOut';

/** How far a cave's way out below reaches beyond its floor's rooms at most, in cells (2.6–3.7 long, faded before the margin). */
const CAVE_WAY_REACH = 3;
/** How far a cave's outline (`caveOutline`) wanders past its cells, at most, in cells. */
const OUTLINE_WANDER = 1;
/** How far past the map's picture a road ends, in cells: farther than its worn ground reaches back in, so no end of it shows. */
const PAST_PICTURE = 3;

/**
 * The cells a Forest's roads are laid on: every cell the map's picture can show (`mapLayout`: the
 * cells of every floor, the entry floor's trails and the floors' ways out below, with the paper's
 * margin round them) and `PAST_PICTURE` beyond. A road laid from one edge of it to another runs
 * off the picture at both ends; laid on the rooms' extent alone, it stopped in the woods inside
 * the picture wherever a trail or a floor below widened the map.
 */
export function roadFrame(floor: DungeonFloor, ways: readonly WayOut[], below: readonly DungeonFloor[]): Bounds {
  // The rooms' extent too: the roads' own ground (`roadGround`) becomes floor anywhere within it.
  const cellsOf = (f: DungeonFloor, grow: number): Bounds => {
    const corners = f.rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 }]);
    const cells = [...corners, ...f.rooms.flatMap((room) => floorCellsOf(room)), ...f.doors.flatMap(doorCells), ...(f.openGround ?? [])];
    const b = pointsBounds(cells);
    return { minX: b.minX - grow, minY: b.minY - grow, maxX: b.maxX + 1 + grow, maxY: b.maxY + 1 + grow };
  };
  const shown = unionBounds([
    cellsOf(floor, OUTLINE_WANDER),
    ...below.filter((f) => f.rooms.length).map((f) => cellsOf(f, OUTLINE_WANDER + CAVE_WAY_REACH)),
    ...ways.map((way) => wayExtent(way, way.length)),
  ]);
  const reach = MAP_MARGIN_CELLS + PAST_PICTURE;
  return { minX: Math.floor(shown.minX) - reach, minY: Math.floor(shown.minY) - reach, maxX: Math.ceil(shown.maxX) + reach, maxY: Math.ceil(shown.maxY) + reach };
}
