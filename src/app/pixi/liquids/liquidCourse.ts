/**
 * The frame a surface with a course flows in: for each texel of its field, how far across the
 * course it lies and how far along it, in cells. The shader reads its patterns in this frame, so a
 * river's ripples and drift follow its bends as one surface, where a single direction would run
 * them over its banks.
 */

import type { Point } from '../../types/visionTypes';
import { nearestLines, type Edge, type LiquidField } from './liquidField';

/** How many lines either side of the one carried on to a texel are looked at for its own nearest. */
const REACH = 3;

/** A surface's course frame, texel by texel: (across, along) in cells, two floats a texel, on its field's grid. */
export interface CourseFrame {
  values: Float32Array;
  width: number;
  height: number;
}

/** A piece of the course: its ends, length, where it starts along the course, and the normals at its ends (to its left as it runs, shared with its neighbours). */
interface Piece extends Edge { length: number; start: number; na: Point; nb: Point }

/** The course's pieces, each with the normals at its ends: the mean of the two pieces' that meet there. */
function piecesOf(course: readonly Point[]): Piece[] {
  const pieces: Piece[] = [];
  let travelled = 0;
  for (let k = 0; k + 1 < course.length; k++) {
    const a = course[k]!;
    const b = course[k + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    pieces.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, length, start: travelled, na: normal, nb: normal });
    travelled += length;
  }
  for (let k = 0; k + 1 < pieces.length; k++) {
    const here = pieces[k]!;
    const next = pieces[k + 1]!;
    const x = here.na.x + next.nb.x;
    const y = here.na.y + next.nb.y;
    const length = Math.hypot(x, y) || 1;
    here.nb = { x: x / length, y: y / length };
    next.na = here.nb;
  }
  return pieces;
}

/**
 * Where a point lies in a piece's sweep: the share `t` of the piece at which the normal, turning
 * from one end's to the other's, passes through the point, and how far along that normal it lies.
 * Null where no such share lies within the piece (`open` lets it run on past the piece's start or
 * end, for the course's own ends).
 */
function sweepOf(piece: Piece, px: number, py: number, openStart: boolean, openEnd: boolean): { t: number; across: number } | null {
  const dx = piece.bx - piece.ax;
  const dy = piece.by - piece.ay;
  const wx = px - piece.ax;
  const wy = py - piece.ay;
  const mx = piece.nb.x - piece.na.x;
  const my = piece.nb.y - piece.na.y;
  const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;
  // cross(w - t d, na + t m) = 0, a quadratic in t.
  const a = -cross(dx, dy, mx, my);
  const b = cross(wx, wy, mx, my) - cross(dx, dy, piece.na.x, piece.na.y);
  const c = cross(wx, wy, piece.na.x, piece.na.y);
  const roots: number[] = [];
  if (Math.abs(a) < 1e-9 * (Math.abs(b) + 1e-12)) {
    if (b !== 0) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }
  let best: { t: number; across: number } | null = null;
  for (const t of roots) {
    if ((t < -SLACK && !openStart) || (t > 1 + SLACK && !openEnd)) continue;
    const nx = piece.na.x + t * mx;
    const ny = piece.na.y + t * my;
    const across = ((wx - t * dx) * nx + (wy - t * dy) * ny) / (Math.hypot(nx, ny) || 1);
    if (!best || Math.abs(across) < Math.abs(best.across)) best = { t, across };
  }
  return best;
}

/** How far past a piece's ends a share may fall and still be its own: what rounding leaves at a shared end. */
const SLACK = 1e-6;

/**
 * The course frame of `course` (world pixels, downstream) on `field`'s grid. Across is the
 * distance from the course, positive to its left as the flow runs (the way a still surface's
 * frame turns), along the course's normals, which turn smoothly from piece to piece; along is the
 * distance down the course from its first point. Both are continuous round every bend on either
 * bank. Past its ends the course goes on straight, so a surface that reaches beyond them keeps an
 * even frame.
 */
export function courseFrame(course: readonly Point[], cell: number, field: Pick<LiquidField, 'width' | 'height' | 'origin' | 'texel'>): CourseFrame {
  const pieces = piecesOf(course);
  const { width, height, origin, texel } = field;
  const nearest = nearestLines(pieces, field);
  const values = new Float32Array(width * height * 2);
  const last = pieces.length - 1;
  for (let j = 0; j < height; j++) {
    const py = origin.y + (j + 0.5) * texel;
    for (let i = 0; i < width; i++) {
      const index = j * width + i;
      const found = nearest.line[index]!;
      if (found < 0) continue;
      const px = origin.x + (i + 0.5) * texel;
      // Carrying on passes a neighbour's nearest piece, which may lie beside this texel's own: the
      // pieces round the one found decide, the one whose sweep reaches the point nearest.
      let at: { k: number; t: number; across: number } | null = null;
      for (let k = Math.max(0, found - REACH); k <= Math.min(last, found + REACH); k++) {
        const sweep = sweepOf(pieces[k]!, px, py, k === 0, k === last);
        if (sweep && (!at || Math.abs(sweep.across) < Math.abs(at.across))) at = { k, ...sweep };
      }
      if (!at) continue;
      const piece = pieces[at.k]!;
      values[index * 2] = at.across / cell;
      values[index * 2 + 1] = (piece.start + at.t * piece.length) / cell;
    }
  }
  return { values, width, height };
}
