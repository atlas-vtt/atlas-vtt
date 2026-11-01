/**
 * What a cave lays along a line through a room: a chasm along its fault, a stream or a lava flow
 * down its length. The cells within half its thickness of the line, its middle wandering and its
 * width swelling and narrowing from one step to the next, as a crack in rock or a flow over it
 * runs, so it never lies as a straight file of cells; the lane's cells stay rock (a natural bridge
 * two cells wide where the main path crosses), and where the room would fall in two, a bridge of
 * rock one or two cells wide crosses it (`bandBridge`).
 */

import { floorCellsOf } from '../../geometry';
import type { CaveFault, CellPoint } from '../../model';
import type { Rng } from '../../rng';
import type { RoomCells } from '../roomCells';
import { type RockBridge, bandBridge, unbroken } from './bandShape';

/** How often the band's middle steps aside, or its width swells or narrows, from one cell along it to the next. */
const MEANDER = 0.4;
const SWELL = 0.45;
/** A band runs along its line: at least this many cells, this many times longer than wide (a thick one less, its width being half its story)... */
const LEAST_CELLS = 3;
const ELONGATION = 2;
const THICK_ELONGATION = 1.6;
/** ...within this angle of it. */
const ALONG = Math.PI / 12;

/** A band's cells, and the cells of the rock bridge that keeps its room whole (none where the room stays whole without one). */
export interface BandCut {
  cells: CellPoint[];
  bridge: RockBridge | null;
}

/** A cell's middle across the line (signed) and along it. */
export function frame(line: CaveFault, c: CellPoint): { off: number; along: number } {
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
 * For each cell's step along the line, how far the band's middle lies beside it and how far its
 * edge reaches from that middle: two walks that step now and then (half a cell in a narrow band, a
 * whole one in a wide band, whose edge would otherwise hardly move), the middle never farther aside
 * than a third of the band's width and the width never more than a quarter of it wider or narrower
 * than it is (half a cell at least, and never under one cell).
 */
function meander(rng: Rng, from: number, to: number, thickness: number): Map<number, { shift: number; half: number }> {
  const out = new Map<number, { shift: number; half: number }>();
  const step = thickness > 2 ? 1 : 0.5;
  const aside = Math.max(0.5, thickness / 3);
  const reach = Math.max(0.5, thickness / 4);
  const narrowest = Math.max(0.5 - thickness / 2, -reach);
  let shift = 0;
  let swell = 0;
  for (let at = from; at <= to; at++) {
    if (rng() < MEANDER) shift = Math.max(-aside, Math.min(aside, shift + (rng() < 0.5 ? -step : step)));
    if (rng() < SWELL) swell = Math.max(narrowest, Math.min(reach, swell + (rng() < 0.5 ? -step : step)));
    out.set(at, { shift, half: thickness / 2 + swell });
  }
  return out;
}

/**
 * The band of about `thickness` cells along `line` in the room, of the cells `may` lets in: off the
 * lane and the stairs, on free floor. Null where too little of it lies in the room, where it does
 * not run along the line or comes out a rectangle, where a straight file of it cannot be broken, or
 * where even a rock bridge leaves the room in two.
 */
export function faultBand(rc: RoomCells, rng: Rng, line: CaveFault, thickness: number, may: (c: CellPoint) => boolean = () => true): BandCut | null {
  const room = floorCellsOf(rc.room);
  const alongs = room.map((c) => Math.round(frame(line, c).along));
  const walk = meander(rng, Math.min(...alongs), Math.max(...alongs), thickness);
  const open = (c: CellPoint): boolean => rc.fits([c]) && !rc.inLane(c) && !rc.nearStairs(c) && may(c);
  const laid = room.filter((c, i) => {
    const { shift, half } = walk.get(alongs[i]!)!;
    return Math.abs(frame(line, c).off - shift) <= half && open(c);
  });
  const cells = unbroken(laid, rng, open);
  if (!cells || cells.length < LEAST_CELLS) return null;
  const whole = rc.allows(cells, 'block');
  const bridge = whole ? null : bandBridge(rc, rng, line.angle, cells);
  if (!whole && bridge === null) return null;
  const axis = principalAxis(cells);
  const least = thickness > 2 ? THICK_ELONGATION : ELONGATION;
  return axis.elongation >= least && lineGap(axis.angle, line.angle) <= ALONG && !rectangular(cells) ? { cells, bridge } : null;
}
