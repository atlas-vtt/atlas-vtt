/**
 * What a cave lays along a line through a room: a chasm along its fault, a stream or a lava flow
 * down its length. The cells within half its thickness of the line, the edge ragged; the lane's
 * cells stay rock (a natural bridge two cells wide where the main path crosses), and where the
 * room would fall in two, a rock bridge two cells wide is left at the band's middle.
 */

import { floorCellsOf } from '../../geometry';
import type { CaveFault, CellPoint } from '../../model';
import type { Rng } from '../../rng';
import type { RoomCells } from '../roomCells';

/** How often the band's middle steps aside, or its edge widens, from one cell along it to the next. */
const MEANDER = 0.35;
const WIDEN = 0.3;
/** Half the length of the rock bridge left where the band would cut the room in two. */
const ROCK_BRIDGE = 1;
/** A band runs along its line: at least this many cells, this many times longer than wide. */
const LEAST_CELLS = 3;
const ELONGATION = 2;
/** ...within this angle of it. */
const ALONG = Math.PI / 12;

/** A cell's middle across the line (signed) and along it. */
function frame(line: CaveFault, c: CellPoint): { off: number; along: number } {
  const dx = c.x + 0.5 - line.x;
  const dy = c.y + 0.5 - line.y;
  const sin = Math.sin(line.angle);
  const cos = Math.cos(line.angle);
  return { off: dx * sin - dy * cos, along: dx * cos + dy * sin };
}

/** The angle the cells run along and how much longer than wide they lie (the square root of the ratio of their spreads). */
export function principalAxis(cells: readonly CellPoint[]): { angle: number; elongation: number } {
  const n = cells.length;
  const mx = cells.reduce((s, c) => s + c.x, 0) / n;
  const my = cells.reduce((s, c) => s + c.y, 0) / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const c of cells) {
    xx += (c.x - mx) ** 2;
    yy += (c.y - my) ** 2;
    xy += (c.x - mx) * (c.y - my);
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const mid = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  const minor = Math.max(mid - spread, 1e-9);
  return { angle, elongation: Math.sqrt((mid + spread) / minor) };
}

/** The angle between two undirected lines. */
function lineGap(a: number, b: number): number {
  const d = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
}

/** Whether the cells fill their bounding rectangle: what no natural feature does. */
export function rectangular(cells: readonly CellPoint[]): boolean {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) === cells.length;
}

/**
 * For each cell's step along the line, how far the band's middle lies beside it and how much its
 * edge widens: a walk that steps half a cell aside now and then, so the band meanders as a crack in
 * rock does and is never a straight-edged strip.
 */
function meander(rng: Rng, from: number, to: number): Map<number, { shift: number; widen: number }> {
  const out = new Map<number, { shift: number; widen: number }>();
  let shift = 0;
  for (let at = from; at <= to; at++) {
    if (rng() < MEANDER) shift = Math.max(-0.5, Math.min(0.5, shift + (rng() < 0.5 ? -0.5 : 0.5)));
    out.set(at, { shift, widen: rng() < WIDEN ? 0.5 : 0 });
  }
  return out;
}

/**
 * The band of `thickness` cells along `line` in the room, of the cells `may` lets in: off the
 * lane and the stairs, on free floor. Null where too little of it lies in the room, where it does
 * not run along the line or comes out a rectangle, or where even a rock bridge leaves the room in two.
 */
export function faultBand(rc: RoomCells, rng: Rng, line: CaveFault, thickness: 1 | 2, may: (c: CellPoint) => boolean = () => true): CellPoint[] | null {
  const half = thickness / 2;
  const room = floorCellsOf(rc.room);
  const alongs = room.map((c) => Math.round(frame(line, c).along));
  const walk = meander(rng, Math.min(...alongs), Math.max(...alongs));
  let cells = room.filter((c, i) => {
    const { off } = frame(line, c);
    const { shift, widen } = walk.get(alongs[i]!)!;
    return Math.abs(off - shift) <= half + widen && rc.fits([c]) && !rc.inLane(c) && !rc.nearStairs(c) && may(c);
  });
  if (cells.length < LEAST_CELLS) return null;
  if (!rc.allows(cells, 'block')) {
    const middle = cells.map((c) => frame(line, c).along).sort((a, b) => a - b)[Math.floor(cells.length / 2)]!;
    cells = cells.filter((c) => Math.abs(frame(line, c).along - middle) >= ROCK_BRIDGE);
    if (cells.length < LEAST_CELLS || !rc.allows(cells, 'block')) return null;
  }
  const axis = principalAxis(cells);
  return axis.elongation >= ELONGATION && lineGap(axis.angle, line.angle) <= ALONG && !rectangular(cells) ? cells : null;
}
