/**
 * A line less what a sweep passed over: the pieces of the line that lie farther than a reach from
 * the sweep's own line. The sweep is a chain of capsules, and a straight piece of a line enters
 * and leaves a capsule at points that can be worked out, so the line is cut exactly where the
 * sweep's edge crosses it, between its saved points, in plain numbers without the clipping grid.
 */

import type { Point } from '../types/visionTypes';

/** A piece a cut leaves of a line, in the line's direction. */
export interface LinePiece {
  readonly points: Point[];
  /** It begins where the line began. */
  readonly fromStart: boolean;
  /** It ends where the line ended. */
  readonly toEnd: boolean;
}

/** The stretch of a segment's 0 to 1 that satisfies everything asked so far; emptied by `from > to`. */
interface Stretch {
  from: number;
  to: number;
}

/** Narrows `stretch` to where `p·t ≤ q`. */
function narrow(stretch: Stretch, p: number, q: number): void {
  if (p === 0) {
    if (q < 0) stretch.to = -1;
  } else if (p < 0) stretch.from = Math.max(stretch.from, q / p);
  else stretch.to = Math.min(stretch.to, q / p);
}

/** Widens `into` by where the segment from (ax, ay) along (dx, dy) lies within `reach` of the point (cx, cy). */
function widenByDisc(into: Stretch, ax: number, ay: number, dx: number, dy: number, cx: number, cy: number, reach: number): void {
  const x = ax - cx;
  const y = ay - cy;
  const a = dx * dx + dy * dy;
  const c = x * x + y * y - reach * reach;
  let from = 0;
  let to = 1;
  if (a === 0) {
    if (c > 0) return;
  } else {
    const b = x * dx + y * dy;
    const root = b * b - a * c;
    if (root < 0) return;
    const spread = Math.sqrt(root);
    from = Math.max(0, (-b - spread) / a);
    to = Math.min(1, (-b + spread) / a);
    if (from > to) return;
  }
  if (from < into.from) into.from = from;
  if (to > into.to) into.to = to;
}

/**
 * The stretch of the segment a–b within `reach` of the segment c–d, written into `into`; false for
 * none. The points that near are a capsule: a box along c–d and a disc around each end. A capsule
 * has no dents, so the segment is inside it over one stretch, from where it first enters one of
 * the three to where it last leaves one.
 */
function withinCapsule(into: Stretch, a: Point, b: Point, c: Point, d: Point, reach: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  into.from = Infinity;
  into.to = -Infinity;
  widenByDisc(into, a.x, a.y, dx, dy, c.x, c.y, reach);
  const length = Math.hypot(d.x - c.x, d.y - c.y);
  if (length > 0) {
    widenByDisc(into, a.x, a.y, dx, dy, d.x, d.y, reach);
    const alongX = (d.x - c.x) / length;
    const alongY = (d.y - c.y) / length;
    // The segment in the box's own axes: `along` from c towards d, `across` to its side.
    const along = (a.x - c.x) * alongX + (a.y - c.y) * alongY;
    const across = (a.y - c.y) * alongX - (a.x - c.x) * alongY;
    const alongStep = dx * alongX + dy * alongY;
    const acrossStep = dy * alongX - dx * alongY;
    const box: Stretch = { from: 0, to: 1 };
    narrow(box, -alongStep, along);
    narrow(box, alongStep, length - along);
    narrow(box, -acrossStep, across + reach);
    narrow(box, acrossStep, reach - across);
    if (box.from <= box.to) {
      if (box.from < into.from) into.from = box.from;
      if (box.to > into.to) into.to = box.to;
    }
  }
  return into.from <= into.to;
}

/** The stretches of the segment a–b the sweep takes, joined where they touch, in order. */
function taken(a: Point, b: Point, sweep: readonly Point[], reach: number): Stretch[] {
  const minX = Math.min(a.x, b.x) - reach;
  const maxX = Math.max(a.x, b.x) + reach;
  const minY = Math.min(a.y, b.y) - reach;
  const maxY = Math.max(a.y, b.y) + reach;
  const found: Stretch[] = [];
  const stretch: Stretch = { from: 0, to: 0 };
  const last = Math.max(1, sweep.length - 1);
  for (let i = 0; i < last; i++) {
    const c = sweep[i]!;
    const d = sweep[i + 1] ?? c;
    if (Math.max(c.x, d.x) < minX || Math.min(c.x, d.x) > maxX || Math.max(c.y, d.y) < minY || Math.min(c.y, d.y) > maxY) continue;
    if (withinCapsule(stretch, a, b, c, d, reach)) found.push({ from: stretch.from, to: stretch.to });
  }
  if (found.length < 2) return found;
  found.sort((one, other) => one.from - other.from);
  const joined = [found[0]!];
  for (let i = 1; i < found.length; i++) {
    const open = joined[joined.length - 1]!;
    if (found[i]!.from <= open.to) open.to = Math.max(open.to, found[i]!.to);
    else joined.push(found[i]!);
  }
  return joined;
}

/**
 * The pieces of the line through `points` that lie farther than `reach` from the line through
 * `sweep` (one point sweeps a disc), or null when the sweep takes nothing of it. A line of one
 * point is a dot, taken whole or not at all. On a `loop` (a line that ends where it began) the
 * piece that runs through the closing point is one piece.
 */
export function outsideSweep(points: readonly Point[], sweep: readonly Point[], reach: number, loop = false): LinePiece[] | null {
  const first = points[0];
  if (!first || sweep.length === 0 || !(reach >= 0)) return null;
  if (points.length === 1) return taken(first, first, sweep, reach).length > 0 ? [] : null;
  const pieces: LinePiece[] = [];
  let piece: Point[] | null = null;
  let fromStart = true;
  let cut = false;
  const close = (): void => {
    if (piece) pieces.push({ points: piece, fromStart, toEnd: false });
    piece = null;
    fromStart = false;
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const at = (t: number): Point => (t <= 0 ? { x: a.x, y: a.y } : t >= 1 ? { x: b.x, y: b.y } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    let reached = 0;
    for (const { from, to } of taken(a, b, sweep, reach)) {
      cut = true;
      if (from > reached) {
        piece ??= [at(reached)];
        piece.push(at(from));
      }
      close();
      reached = to;
    }
    if (reached < 1) {
      piece ??= [at(reached)];
      piece.push(at(1));
    }
  }
  if (!cut) return null;
  if (piece) pieces.push({ points: piece, fromStart, toEnd: true });
  const head = pieces[0];
  const tail = pieces[pieces.length - 1];
  if (loop && pieces.length > 1 && head?.fromStart && tail?.toEnd) {
    pieces.pop();
    pieces[0] = { points: [...tail.points, ...head.points.slice(1)], fromStart: false, toEnd: false };
  }
  return pieces;
}
