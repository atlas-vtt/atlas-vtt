/**
 * A cave chamber grown cell by cell inside its room's rectangle (seed growth on square
 * cells): from what the room must keep (a 3 × 3 core near its middle, the cells before its doors,
 * its stairwells and their rows, the lane, the boss arena's platform), each step taking a cell
 * beside the chamber, likelier the more of its eight neighbours are already chamber (`pow(c,
 * gamma)`) and along the cave's faults; then smoothed, never giving up what it must keep.
 */

import { doorApproaches } from '../../floors/stairSpots';
import { cellKey, cellsOf, floorRect, inRect } from '../../geometry';
import type { CellPoint, DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { arenaSeeds } from '../../terrain/arena';
import { type CaveGrid, NEAR4, NEAR8, ROCK, unkey } from './caveGrid';
import { inSwell } from './laneCells';
import { type ChamberField, chamberField } from './chamberField';
import { type Option, neighboursIn, readingIndex } from './chamberFrontier';

export interface ChamberShape {
  gamma: number;
  stretch: number;
  fill: number;
  faults: readonly number[];
}

/** A chamber never fills less than its seeds and this many cells more. */
const FLOOR_EXTRA = 9;
/** How strongly growth follows the chamber's field rather than its neighbours. */
const FOLLOW_FIELD = 6;
/** How much farther from the middle a core may stand for each of its cells it keeps off another room's rectangle. */
const CROWDED = 0.5;

const key = (c: CellPoint): string => cellKey(c.x, c.y);

function mayTake(grid: CaveGrid, room: DungeonRoom, c: CellPoint): boolean {
  return inRect(floorRect(room), c.x, c.y) && (grid.holds(c.x, c.y, room.id) || grid.mayClaim(c.x, c.y, room.id));
}

/** Whether the room may take the cell for its core out in its swell: one cell past its rectangle, in rock no room's rectangle holds. */
function mayTakeOut(grid: CaveGrid, room: DungeonRoom, c: CellPoint): boolean {
  if (mayTake(grid, room, c)) return true;
  return inSwell(grid, grid.doors, room, c.x, c.y, 1) && grid.mayClaim(c.x, c.y, room.id);
}

/** How many of the block's cells lie within two cells of another room's rectangle: with only a wall between. */
function crowding(grid: CaveGrid, room: DungeonRoom, block: readonly CellPoint[]): number {
  return block.filter((c) => NEAR8.some(([dx, dy]) => [1, 2].some((k) => ![ROCK, room.id].includes(grid.envelope(c.x + k * dx, c.y + k * dy))))).length;
}

/**
 * The 3 × 3 block nearest the room's middle that the room may take whole; none where nothing of
 * that size fits. Shaping (`out`), it may also stand a cell out in the room's swell, and keeps
 * off other rooms' rectangles where it can, so the rock between two rooms may thicken.
 */
function coreBlock(grid: CaveGrid, room: DungeonRoom, out = false): CellPoint[] {
  const r = floorRect(room);
  const reach = out ? 1 : 0;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const may = out ? mayTakeOut : mayTake;
  let best: CellPoint[] = [];
  let bestScore = Infinity;
  for (let y = r.y0 - reach; y + 2 <= r.y1 + reach; y++) {
    for (let x = r.x0 - reach; x + 2 <= r.x1 + reach; x++) {
      const distance = Math.hypot(x + 1.5 - cx, y + 1.5 - cy);
      if (distance >= bestScore) continue;
      const block = cellsOf({ x0: x, y0: y, x1: x + 2, y1: y + 2 });
      if (!block.every((c) => may(grid, room, c))) continue;
      const score = distance + (out ? CROWDED * crowding(grid, room, block) : 0);
      if (score < bestScore) {
        best = block;
        bestScore = score;
      }
    }
  }
  return best;
}

/**
 * Keeps a 3 × 3 block in every chamber before anything else is shaped, so no tunnel or narrows
 * takes the cells it needs; whether every chamber has one.
 */
export function reserveCores(grid: CaveGrid, rooms: readonly DungeonRoom[], out = false): boolean {
  return rooms.every((room) => {
    if (room.kind !== 'room') return true;
    const core = coreBlock(grid, room, out);
    grid.require(room.id, core);
    return core.length > 0;
  });
}

/**
 * A cell by number rather than by key while chambers are joined: a join walks the same cells again
 * for every piece and every stairwell asked about, and numbers are looked up faster than text.
 */
const SPAN = 1 << 15;
const numberOf = (x: number, y: number): number => (x + SPAN / 2) * SPAN + (y + SPAN / 2);
const cellOf = (n: number): CellPoint => ({ x: Math.floor(n / SPAN) - SPAN / 2, y: (n % SPAN) - SPAN / 2 });
const fromKey = (k: string): number => {
  const c = unkey(k);
  return numberOf(c.x, c.y);
};
/** The four side neighbours of a cell's number, in `NEAR4`'s order. */
const SIDE_STEPS = NEAR4.map(([dx, dy]) => dx * SPAN + dy);

/** Whether the room may take each cell, worked out once a cell. Valid while the grid is not changed. */
export type Takes = (c: CellPoint, n: number) => boolean;

export function takesOf(grid: CaveGrid, room: DungeonRoom): Takes {
  const known = new Map<number, boolean>();
  return (c, n) => {
    let may = known.get(n);
    if (may === undefined) {
      may = mayTake(grid, room, c);
      known.set(n, may);
    }
    return may;
  };
}

/** The fewest cells the room may take (`takes`) that join `from` to `reached` without crossing `blocked`, or none where no way leads. */
function joinPath(takes: Takes, from: number, reached: ReadonlySet<number>, blocked: ReadonlySet<number>): CellPoint[] | null {
  const back = new Map<number, number>([[from, from]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    if (reached.has(at)) {
      const path: CellPoint[] = [];
      for (let k = at; k !== from; k = back.get(k)!) path.push(cellOf(k));
      return path;
    }
    for (const step of SIDE_STEPS) {
      const n = at + step;
      if (back.has(n) || blocked.has(n) || !takes(cellOf(n), n)) continue;
      back.set(n, at);
      queue.push(n);
    }
  }
  return null;
}

/** Groups of cells side by side. */
function pieces(cells: ReadonlySet<number>): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const piece = [start];
    seen.add(start);
    for (let head = 0; head < piece.length; head++) {
      for (const step of SIDE_STEPS) {
        const k = piece[head]! + step;
        if (cells.has(k) && !seen.has(k)) {
          seen.add(k);
          piece.push(k);
        }
      }
    }
    out.push(piece);
  }
  return out;
}

/**
 * `kept` joined into one piece through cells the room may take, never through `blocked` (its
 * stairwells: a token steps onto stairs only across their ground end, so they join nothing), and
 * whether every piece could be joined.
 */
function joinRound(takes: Takes, kept: ReadonlySet<string>, blocked: ReadonlySet<string>): { joined: Set<string>; whole: boolean } {
  const stops = new Set([...blocked].map(fromKey));
  const walked = new Set([...kept].map(fromKey).filter((k) => !stops.has(k)));
  const [main, ...rest] = pieces(walked).sort((a, b) => b.length - a.length);
  const joined = new Set(main ?? []);
  let whole = true;
  for (const piece of rest) {
    for (const k of piece) joined.add(k);
    const own = new Set(piece);
    const way = joinPath(takes, piece[0]!, new Set([...joined].filter((k) => !own.has(k))), stops);
    if (way === null) whole = false;
    for (const c of way ?? []) joined.add(numberOf(c.x, c.y));
  }
  return { joined: new Set([...joined].map((n) => key(cellOf(n)))), whole };
}

/** What a chamber grows from, and whether all of it could be joined into one piece. */
export interface ChamberSeeds {
  seeds: CellPoint[];
  whole: boolean;
}

/**
 * What a chamber must keep, joined into one piece round its stairwells (`joinRound`): its core,
 * its kept cells, the lane in it (but where a neck took it) and, for the boss, the arena's platform.
 */
export function chamberSeeds(grid: CaveGrid, room: DungeonRoom, lane: ReadonlySet<string>): ChamberSeeds {
  const r = floorRect(room);
  // The core is kept already (`reserveCores`), with the rest the room needs.
  const seeds = new Set<string>(grid.required(room.id));
  // A lane cell given to a neck's rock (`holdNecks`) is no longer the room's.
  for (const k of lane) {
    const c = unkey(k);
    if (inRect(r, c.x, c.y) && !grid.heldAsRock(c.x, c.y)) seeds.add(k);
  }
  if (room.boss) for (const c of arenaSeeds(room)) if (mayTake(grid, room, c)) seeds.add(key(c));
  const { joined, whole } = joinRound(takesOf(grid, room), seeds, grid.stairCells);
  for (const k of seeds) joined.add(k);
  return { seeds: [...joined].map(unkey).sort((a, b) => a.y - b.y || a.x - b.x), whole };
}

/**
 * Whether what the room keeps (its core, the cells before its doors, the lane, its stairwells' rows,
 * and `extra`'s cells and row, a stairwell it would hold too) can be joined round its stairwells:
 * the cave counterpart of `spotFits`' "the room's other floor still one", on the cells a chamber
 * may take, since a cave room keeps off every other room's. Asked where stairs are placed, so the
 * row each stairwell is entered from always reaches the rest of its floor.
 */
export function stairsJoinRound(grid: CaveGrid, room: DungeonRoom, extra?: { cells: readonly string[]; row: readonly string[] }, takes: Takes = takesOf(grid, room)): boolean {
  const kept = new Set([...grid.required(room.id), ...(extra?.row ?? [])]);
  const blocked = extra ? new Set([...grid.stairCells, ...extra.cells]) : grid.stairCells;
  return joinRound(takes, kept, blocked).whole;
}

/**
 * Grows the chamber from its seeds to its fill share of the rectangle (never below seeds + 9): each
 * step takes a cell beside it, likelier the more of its neighbours are chamber (`pow(c, gamma)`)
 * and the higher the chamber's field there (its lobes along the fault, its mouths). The field is
 * returned, for growing the chamber past its rectangle once the tunnels are carved.
 */
export function growChamber(rng: Rng, grid: CaveGrid, room: DungeonRoom, seeds: readonly CellPoint[], shape: ChamberShape): ChamberField {
  for (const c of seeds) grid.claim(c.x, c.y, room.id);
  const rect = floorRect(room);
  const field = chamberField(rng, room, shape.faults, shape.stretch, doorApproaches(room, grid.doors).filter((c) => inRect(rect, c.x, c.y)));
  const mask = new Set(grid.cellsOf(room.id).filter((c) => inRect(rect, c.x, c.y)).map(key));
  const target = Math.min(room.w * room.h, Math.max(Math.round(shape.fill * room.w * room.h), seeds.length + FLOOR_EXTRA));
  // The cells beside the chamber it may take, kept as it grows (a cell it may take stays so: only this room claims meanwhile).
  const weight = (n: CellPoint): number => neighboursIn(mask, n) ** shape.gamma * Math.exp(FOLLOW_FIELD * field(n.x, n.y));
  const frontier = new Map<string, Option>();
  // The same options in reading order, which the pick walks: kept sorted as they come, not sorted anew at every step.
  const options: Option[] = [];
  const reach = (c: CellPoint): void => {
    for (const [dx, dy] of NEAR4) {
      const n = { x: c.x + dx, y: c.y + dy };
      const nk = key(n);
      if (mask.has(nk) || frontier.has(nk) || !mayTake(grid, room, n)) continue;
      const option: Option = [n, weight(n)];
      frontier.set(nk, option);
      options.splice(readingIndex(options, n), 0, option);
    }
  };
  for (const k of mask) reach(unkey(k));
  while (mask.size < target) {
    if (frontier.size === 0) break;
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    let pickAt = rng() * total;
    const found = options.findIndex(([, w]) => (pickAt -= w) < 0);
    const at = found < 0 ? options.length - 1 : found;
    const chosen = options[at]![0];
    options.splice(at, 1);
    grid.claim(chosen.x, chosen.y, room.id);
    mask.add(key(chosen));
    frontier.delete(key(chosen));
    for (const [dx, dy] of NEAR8) {
      const nk = cellKey(chosen.x + dx, chosen.y + dy);
      const entry = frontier.get(nk);
      if (entry) entry[1] = weight(entry[0]);
    }
    reach(chosen);
  }
  return field;
}

/** Whether the mask stays one piece without `without`, its stairwells joining nothing. */
function stillWhole(grid: CaveGrid, mask: ReadonlySet<string>, without: string): boolean {
  const rest = new Set([...mask].filter((k) => !grid.stairCells.has(k) && k !== without).map(fromKey));
  return pieces(rest).length <= 1;
}

/** Fills cells with five or more of their eight neighbours in the chamber and drops those with two or fewer, never a kept one, never splitting it (round its stairwells). */
export function smoothChamber(grid: CaveGrid, room: DungeonRoom, keep: ReadonlySet<string>, passes: 1 | 2): void {
  const r = floorRect(room);
  for (let pass = 0; pass < passes; pass++) {
    const mask = new Set(grid.cellsOf(room.id).filter((c) => inRect(r, c.x, c.y)).map(key));
    for (const c of cellsOf(r)) {
      const k = key(c);
      const n = neighboursIn(mask, c);
      if (!mask.has(k) && n >= 5 && grid.mayClaim(c.x, c.y, room.id)) {
        grid.claim(c.x, c.y, room.id);
        mask.add(k);
      } else if (mask.has(k) && n <= 2 && !keep.has(k) && stillWhole(grid, mask, k)) {
        grid.release(c.x, c.y);
        mask.delete(k);
      }
    }
  }
}
