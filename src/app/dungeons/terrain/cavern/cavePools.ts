/**
 * Standing water in a cave and what it keeps a cell away from: a lake or a sump grown out from the
 * part of its room farthest from the way through, ragged as water lies in rock, never a rectangle;
 * no hole, pit, shaft or molten channel beside water, and no water beside them.
 */

import { cellKey, floorCellsOf } from '../../geometry';
import type { CellPoint, DungeonTerrain } from '../../model';
import type { Rng } from '../../rng';
import { leavesRoom } from '../hazards';
import type { FloorTerrain } from '../floorTerrain';
import type { RoomCells } from '../roomCells';
import { rectangular } from './faultBand';

const HOLES: ReadonlySet<string> = new Set(['chasm', 'shaft', 'pit', 'gallery']);

const isWater = (p: DungeonTerrain): boolean => p.kind === 'pool' || p.kind === 'shallow-water' || p.traits.hazard === 'deep-water';
const isHoleOrMolten = (p: DungeonTerrain): boolean => HOLES.has(p.kind) || p.traits.hazard === 'lava' || p.traits.hazard === 'acid';

/** Whether a cell lies within a cell of a piece `which` picks, on the floor as it stands now. */
function beside(floor: FloorTerrain, which: (p: DungeonTerrain) => boolean): (c: CellPoint) => boolean {
  const near = new Set<string>();
  for (const piece of floor.pieces.filter(which)) for (const c of piece.cells) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.add(cellKey(c.x + dx, c.y + dy));
  return (c) => near.has(cellKey(c.x, c.y));
}

/** Within a cell of standing or running water. */
export function besideWater(floor: FloorTerrain): (c: CellPoint) => boolean {
  return beside(floor, isWater);
}

/** Within a cell of a hole or a molten channel. */
export function besideHole(floor: FloorTerrain): (c: CellPoint) => boolean {
  return beside(floor, isHoleOrMolten);
}

const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

/** The most cells one pool fills, however large its chamber: a lake of 1,500 square feet is plenty, and a larger one costs every later check its size. */
export const MOST_POOL_CELLS = 60;

/**
 * A pool of about `share` of the room's floor (at most `MOST_POOL_CELLS`), grown cell by cell from
 * the free cell farthest from the cells the room keeps reachable, of the cells `may` lets in, off
 * the lane and the stairs; the largest that leaves the room whole and is no rectangle, at least four
 * cells. Null where none is.
 */
export function naturalPool(rc: RoomCells, rng: Rng, share: number, may: (c: CellPoint) => boolean): CellPoint[] | null {
  const open = floorCellsOf(rc.room).filter((c) => rc.fits([c]) && !rc.inLane(c) && !rc.nearStairs(c) && may(c));
  if (open.length < 4) return null;
  const reach = rc.needed.length > 0 ? rc.needed : open.slice(0, 1);
  const farness = (c: CellPoint): number => Math.min(...reach.map((n) => Math.abs(n.x - c.x) + Math.abs(n.y - c.y)));
  const start = open.reduce((best, c) => (farness(c) > farness(best) ? c : best), open[0]!);
  const allowed = new Set(open.map((c) => cellKey(c.x, c.y)));
  const grown: CellPoint[] = [start];
  const seen = new Set([cellKey(start.x, start.y)]);
  const target = Math.min(MOST_POOL_CELLS, Math.max(4, Math.floor(rc.floorCount * share)));
  // Every free neighbour of every grown cell, in the order the grown cells came and once per cell it borders.
  const frontier: CellPoint[] = [];
  const border = (c: CellPoint): void => {
    for (const d of STEPS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (allowed.has(cellKey(n.x, n.y)) && !seen.has(cellKey(n.x, n.y))) frontier.push(n);
    }
  };
  border(start);
  while (grown.length < target && frontier.length > 0) {
    const next = frontier[Math.floor(rng() * frontier.length)]!;
    seen.add(cellKey(next.x, next.y));
    grown.push(next);
    const kept = frontier.filter((c) => c.x !== next.x || c.y !== next.y);
    frontier.length = 0;
    frontier.push(...kept);
    border(next);
  }
  // Whether the room stays whole is the cheaper question, and a pool that splits it never keeps a place for cover.
  for (let size = grown.length; size >= 4; size--) {
    const cells = grown.slice(0, size);
    if (!rectangular(cells) && rc.allows(cells, 'block') && leavesRoom(rc, cells)) return cells;
  }
  return null;
}
