/**
 * An abyss at a great chamber's edge: Veins of the Earth's lips over roaring abyssal falls, its
 * wedge chamber that simply ends at the drop. The chasm runs the length of one side of the chamber
 * and swallows up to a third of its floor, the floor ending at a ragged lip and nothing crossing
 * it. It keeps off every way through the chamber, the ground before its doors and round its stairs,
 * a cell from water, off rock thinner than two cells and off other ways, and leaves the room whole
 * with a place for cover, as every hole does; it opens onto the floor below where one lies under
 * it, else it is bottomless. It is the one chasm that follows no fault, so it says which side it
 * falls away towards (`facing`).
 */

import { cellKey, doorCells, floorCellsOf, perpendicular } from '../../geometry';
import type { CellDir, CellPoint } from '../../model';
import { type Rng, shuffled } from '../../rng';
import { leavesRoom, overRoomBelow } from '../hazards';
import { cutHole, dropBelow } from '../holes';
import type { RoomCells } from '../roomCells';
import { laneCells } from '../roomLanes';
import type { TerrainWork } from '../work';
import { besideWater } from './cavePools';
import { rectangular } from './faultBand';
import { type Great, mayTake } from './greatGround';

/** The most of its chamber an abyss swallows, and the least: a strip along a gargantuan cave's wall is no abyss. */
const MOST_SHARE = 1 / 3;
const LEAST_SHARE = 1 / 12;
const LEAST_CELLS = 10;
/** How often its lip steps in or out from one line across the side to the next, and how many lines at either end it narrows over. */
const RAGGED = 0.5;
const TAPER = 2;
/** The fewest lines across its side an abyss runs along: shorter, it is a pit in a corner. */
const LEAST_RUN = 4;

const SIDES: readonly CellDir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export interface AbyssOptions {
  /** Its fall must open onto the floor below (a sinkhole's). */
  below?: boolean;
  /** Cells it keeps off besides the room's own ways (a great chamber's). */
  kept?: (c: CellPoint) => boolean;
  /** The most cells it may take. */
  most?: number;
}

const dot = (c: CellPoint, d: CellDir): number => c.x * d.x + c.y * d.y;

/** The longest unbroken run of lines across the side whose wall cell the abyss may take, as a set of line numbers. */
function longestRun(lines: readonly number[], open: (q: number) => boolean): Set<number> {
  let best: number[] = [];
  let run: number[] = [];
  for (const q of lines) {
    run = open(q) && (run.length === 0 || run[run.length - 1] === q - 1) ? [...run, q] : open(q) ? [q] : [];
    if (run.length > best.length) best = run;
  }
  return new Set(best);
}

/** The cells reached from `start` through `cells`, a step at a time. */
function reached(cells: readonly CellPoint[], start: CellPoint): CellPoint[] {
  const left = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const out = [start];
  left.delete(cellKey(start.x, start.y));
  for (let i = 0; i < out.length; i++) {
    for (const d of SIDES) {
      const n = { x: out[i]!.x + d.x, y: out[i]!.y + d.y };
      if (left.delete(cellKey(n.x, n.y))) out.push(n);
    }
  }
  return out;
}

/**
 * The abyss along `side`: from the wall in, on every line across the side, as deep as its lip
 * lies there, a walk about `depth` that narrows to nothing at either end; only the longest run of
 * lines whose wall cell it may take, and only what of it hangs together with that wall.
 */
function alongSide(rc: RoomCells, rng: Rng, side: CellDir, depth: number, may: (c: CellPoint) => boolean): CellPoint[] {
  const across = perpendicular(side);
  const floor = floorCellsOf(rc.room).filter((c) => rc.isFloor(c));
  const wall = new Map<number, number>();
  for (const c of floor) wall.set(dot(c, across), Math.max(wall.get(dot(c, across)) ?? -Infinity, dot(c, side)));
  const atWall = (q: number): CellPoint | undefined => floor.find((c) => dot(c, across) === q && dot(c, side) === wall.get(q));
  const run = longestRun([...wall.keys()].sort((a, b) => a - b), (q) => {
    const c = atWall(q);
    return c !== undefined && may(c);
  });
  if (run.size < LEAST_RUN) return [];
  const lines = [...run].sort((a, b) => a - b);
  const lip = new Map<number, number>();
  let walk = 0;
  lines.forEach((q, i) => {
    if (rng() < RAGGED) walk = Math.max(-depth / 2, Math.min(depth / 2, walk + (rng() < 0.5 ? -0.5 : 0.5) * Math.max(1, depth / 3)));
    const end = Math.min(i, lines.length - 1 - i);
    lip.set(q, (depth + walk) * Math.min(1, (end + 1) / (TAPER + 1)));
  });
  const cells = floor.filter((c) => {
    const reach = lip.get(dot(c, across));
    return reach !== undefined && wall.get(dot(c, across))! - dot(c, side) < reach && may(c);
  });
  const start = atWall(lines[Math.floor(lines.length / 2)]!);
  return start && cells.some((c) => c.x === start.x && c.y === start.y) ? reached(cells, start) : [];
}

/** Whether the abyss would ring round floor of its room, which then stands as an island in it: no lip of an abyss runs round a stone. */
function enclosesFloor(rc: RoomCells, cells: readonly CellPoint[]): boolean {
  const abyss = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const floor = floorCellsOf(rc.room).filter((c) => rc.isFloor(c) && !abyss.has(cellKey(c.x, c.y)));
  const start = floor[0];
  return start !== undefined && reached(floor, start).length < floor.length;
}

/** Lays an abyss along one side of the chamber; its cells, or null where no side takes one. */
export function abyssEdge(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, options: AbyssOptions = {}): CellPoint[] | null {
  const floor = work.floors[k];
  if (!floor || (options.below && k + 1 >= work.floors.length)) return null;
  const wet = besideWater(floor);
  const ways = new Set([...laneCells(rc), ...rc.needed].map((c) => cellKey(c.x, c.y)));
  const nearWay = (c: CellPoint): boolean => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (ways.has(cellKey(c.x + dx, c.y + dy))) return true;
    return false;
  };
  // Beside it lies its own floor or solid rock two cells deep: a wall that thin is drawn round from both sides at once, and a doorway or another way beside it pins the wall to its cells.
  const ground = new Set([...floor.plan.rooms.flatMap((room) => floorCellsOf(room)), ...floor.plan.doors.flatMap(doorCells)].map((c) => cellKey(c.x, c.y)));
  const solidBehind = (c: CellPoint): boolean => SIDES.every((d) => {
    const n = { x: c.x + d.x, y: c.y + d.y };
    return rc.isFloor(n) || (!ground.has(cellKey(n.x, n.y)) && !ground.has(cellKey(n.x + d.x, n.y + d.y)));
  });
  const may = (c: CellPoint): boolean => rc.fits([c]) && !rc.inLane(c) && !rc.nearStairs(c) && !nearWay(c) && !wet(c) && solidBehind(c) && !(options.kept?.(c) ?? false);
  const most = Math.min(options.most ?? Infinity, Math.floor(rc.floorCount * MOST_SHARE));
  const least = Math.max(LEAST_CELLS, Math.floor(rc.floorCount * LEAST_SHARE));
  for (const side of shuffled(rng, SIDES)) {
    const lines = new Set(floorCellsOf(rc.room).map((c) => dot(c, perpendicular(side)))).size;
    // From most of its third down: a shallower lip where the deeper one meets a way.
    for (const fill of [0.9, 0.6, 0.4]) {
      const cells = alongSide(rc, rng, side, Math.max(1.5, (most * fill) / Math.max(1, lines)), may);
      if (cells.length < least || cells.length > most || rectangular(cells) || enclosesFloor(rc, cells)) continue;
      if (!rc.allows(cells, 'block') || !leavesRoom(rc, cells) || !overRoomBelow(work, k, cells)) continue;
      const drop = dropBelow(work, k, cells, rng);
      if (!drop || (options.below && drop.bottom === null && drop.through.length === 0)) continue;
      if (cutHole(work, k, rc, 'chasm', cells, drop, { facing: side }) !== null) return cells;
    }
  }
  return null;
}

/** What a great chamber's interior keeps of its share for the fallen blocks laid round an abyss, in cells. */
const BLOCKS_BESIDE = 16;

/** A great chamber's interior that is an abyss along one side, off its ways, leaving the interior room for the fallen blocks beside it. */
export function abyssHall(g: Great): void {
  const cells = abyssEdge(g.work, g.k, g.rc, g.rng, { kept: (c) => !mayTake(g, c), most: g.left - BLOCKS_BESIDE });
  if (!cells) return;
  g.left -= cells.length;
  g.own.push(...cells);
  g.laid++;
}
