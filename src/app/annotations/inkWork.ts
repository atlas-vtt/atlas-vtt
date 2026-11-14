/**
 * How much there is to work out for a drawing's even ink or its cleaned fill, told before it is
 * worked out. Both are clipped, and clipping costs by the corners of a line, by how many of its
 * segments lie beside each other, and by how often it crosses itself: a scribble of two thousand
 * corners takes seconds. What is past the budget is drawn the plain way instead (`drawingInk`),
 * so no one drawing holds up a frame.
 *
 * A count of the line's own points and crossings, never a clock: the same drawing is drawn the
 * same way on every device and page.
 */

import type { Point } from '../types/visionTypes';
import { segmentsMeet } from './lineMath';

/**
 * The most work the ink of one drawing may be, in units of one point of a plain see-through line:
 * about 5 µs each on a 2024 laptop, so about 8 ms for a drawing at the budget (`inkWork.test.ts`
 * prints what it comes to).
 */
export const MAX_INK_WORK = 2000;

/** What the parts of the work cost, in those units. */
interface WorkRates {
  /** A point of the line. */
  readonly point: number;
  /** A segment that lies beside another, where the clipping's sweep comes to it. */
  readonly beside: number;
  /** A crossing of the line with itself. */
  readonly crossing: number;
}

/**
 * A see-through line: it is widened first, so segments that lie beside each other overlap, and
 * every crossing is a crossing of its two edges. Set by the dearest lines measured (hatching of
 * long slanted strokes, scribbles of long straight lines); most lines cost less than this says.
 */
const EVEN: WorkRates = { point: 1, beside: 0.15, crossing: 1.5 };
/** A fill: its outline is clipped as it is. */
const FILL: WorkRates = { point: 0.15, beside: 0.008, crossing: 0.3 };
/** What the two round ends of a dash or a dot cost, in points of the line. */
const DASH_WORK = 4;

/**
 * The work of clipping the line through `points` at `rates`, counted until it passes `most`
 * (and then anything above `most`). The clipping sweeps over the line from its least y to its
 * greatest: each segment costs as many steps as there are segments open where it begins, and each
 * crossing of two segments one more, so that is what is walked here.
 */
export function lineWork(points: readonly Point[], rates: WorkRates, most: number): number {
  const count = points.length - 1;
  let work = points.length * rates.point;
  if (count < 2 || work > most) return work;
  const low = (i: number): number => Math.min(points[i]!.y, points[i + 1]!.y);
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => low(a) - low(b));
  const closed = points[0]!.x === points[count]!.x && points[0]!.y === points[count]!.y;
  let open: number[] = [];
  for (const segment of order) {
    const a = points[segment]!;
    const b = points[segment + 1]!;
    const from = Math.min(a.y, b.y);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const still: number[] = [];
    for (const other of open) {
      const c = points[other]!;
      const d = points[other + 1]!;
      if (Math.max(c.y, d.y) < from) continue;
      still.push(other);
      // Neighbours on the line meet where they join, and on a closed one so do the last segment and the first.
      const gap = Math.abs(segment - other);
      if (gap === 1 || (closed && gap === count - 1)) continue;
      if (Math.max(c.x, d.x) < left || Math.min(c.x, d.x) > right) continue;
      if (segmentsMeet(a, b, c, d)) work += rates.crossing;
    }
    work += still.length * rates.beside;
    if (work > most) return work;
    still.push(segment);
    open = still;
  }
  return work;
}

/**
 * Whether the even ink of a see-through line is within the budget. `line` is the line as it is
 * drawn (its curve), `pieces` what it is stroked as (itself, or its dashes).
 */
export function evenInkAffordable(line: readonly Point[], pieces: readonly (readonly Point[])[]): boolean {
  // The dashes follow the line, so its own crossings and its segments beside each other are theirs.
  let extra = pieces.length > 1 ? pieces.length * DASH_WORK - line.length : 0;
  if (pieces.length > 1) for (const piece of pieces) extra += piece.length;
  const most = MAX_INK_WORK - Math.max(0, extra) * EVEN.point;
  return most >= 0 && lineWork(line, EVEN, most) <= most;
}

/** Whether cleaning the fill of `outline` (closed) with `holes` is within the budget. */
export function cleanFillAffordable(outline: readonly Point[], holes: readonly (readonly Point[])[]): boolean {
  let inHoles = 0;
  for (const hole of holes) inHoles += hole.length;
  // A hole is cleaned on its own and then cut out: twice the work of its points.
  const most = MAX_INK_WORK - 2 * inHoles * FILL.point;
  return most >= 0 && lineWork(outline, FILL, most) <= most;
}
