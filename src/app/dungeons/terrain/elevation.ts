/**
 * Height inside a floor (Terrain principle 5, Map-Fu's elevation without text): a platform against
 * a room's far wall, or a ledge along a side wall, raised 5 or 10 ft, with steps as the easy way
 * up and the cell before the steps kept clear. Its height goes into the traits, never onto the map.
 */

import type { CellDir, CellPoint } from '../model';
import { dir } from '../geometry';
import { type Rng, chance } from '../rng';
import { draft } from './catalog';
import type { FloorTerrain } from './floorTerrain';
import type { RoomCells } from './roomCells';
import { freeRunAlong } from './shapes';

function negate(d: CellDir): CellDir {
  return dir(-d.x, -d.y);
}

/** The cell one step from `c` along `d`. */
function step(c: CellPoint, d: CellDir): CellPoint {
  return { x: c.x + d.x, y: c.y + d.y };
}

/** A platform's cells `w` wide and `deep` rows against the far wall, centred, and its steps and the cells at their foot. */
export function farWallBlock(rc: RoomCells, deep: number, w: number): { cells: CellPoint[]; steps: CellPoint[]; foot: CellPoint[] } {
  const facing = negate(rc.axis);
  const j0 = Math.floor((rc.width - w) / 2);
  const middle = w % 2 === 1 ? [j0 + (w - 1) / 2] : [j0 + w / 2 - 1, j0 + w / 2];
  const steps = middle.map((j) => rc.cell(rc.depth - deep, j));
  return { cells: rc.block(rc.depth - deep, j0, deep, w), steps, foot: steps.map((c) => step(c, facing)) };
}

/**
 * A platform `deep` rows against the far wall, as wide as fits from `widest` down to three cells,
 * centred, its steps in the middle of its front facing the way in. Its id, or null.
 */
export function platformAtFarWall(floor: FloorTerrain, rc: RoomCells, deep: number, widest: number, elevation: number): number | null {
  if (rc.depth < deep + 3) return null;
  const facing = negate(rc.axis);
  for (let w = Math.min(widest, rc.width - 2); w >= 3; w--) {
    const { cells, steps, foot } = farWallBlock(rc, deep, w);
    if (!foot.every((c) => rc.isFree(c))) continue;
    const id = floor.place(draft('platform', rc.room.id, cells, { facing, steps, traits: { elevation } }));
    if (id === null) continue;
    rc.keepClear(foot);
    return id;
  }
  return null;
}

/** A ledge one cell deep along a side wall, at least three cells long, steps at one end leading down along the wall (`facing`). */
export function ledgeAlongWall(floor: FloorTerrain, rc: RoomCells, rng: Rng): number | null {
  if (rc.depth < 5 || rc.width < 4) return null;
  const sides = chance(rng, 0.5) ? [0, rc.width - 1] : [rc.width - 1, 0];
  for (const j of sides) {
    const run = freeRunAlong(rc, j, 1, rc.depth - 2).slice(0, 6);
    if (run.length < 3) continue;
    const atStart = chance(rng, 0.5);
    const stepCell = (atStart ? run[0] : run[run.length - 1]) as CellPoint;
    const along = atStart ? negate(rc.axis) : rc.axis;
    const foot = step(stepCell, along);
    if (!rc.isFloor(foot) || rc.isBlocked(foot)) continue;
    const id = floor.place(draft('ledge', rc.room.id, run, { facing: along, steps: [stepCell] }));
    if (id === null) continue;
    if (rc.isFree(foot)) rc.keepClear([foot]);
    return id;
  }
  return null;
}
