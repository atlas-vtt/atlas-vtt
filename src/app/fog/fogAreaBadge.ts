/**
 * Where a fog area's badge sits: the point inside its outline farthest from its edges (the
 * pole of inaccessibility), so the badge lies in the widest part of a room, never on a wall and
 * never outside an outline that bends around its own middle.
 */

import type { Point } from '../types/visionTypes';

type Outline = readonly Point[];

/** The badge's place is found to this share of the outline's smaller side. */
const PRECISION = 0.01;
/** Squares looked at before the best place so far is taken: an outline of any shape costs no more. */
const MAX_SQUARES = 4000;
/** The lines across a sliver that are tried where no square's middle lies inside it. */
const MAX_SCANLINES = 64;

/** How often the outline winds around `point`: not at all outside it (the nonzero rule fog is filled by). */
function winding(outline: Outline, x: number, y: number): number {
  let turns = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    if ((a.y <= y) === (b.y <= y)) continue;
    const side = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
    if (a.y <= y && side > 0) turns++;
    else if (a.y > y && side < 0) turns--;
  }
  return turns;
}

function edgeDistance(outline: Outline, x: number, y: number): number {
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length));
    const away = (x - a.x - along * dx) ** 2 + (y - a.y - along * dy) ** 2;
    if (away < nearest) nearest = away;
  }
  return Math.sqrt(nearest);
}

/** A square of the search: its middle, half its side, how far its middle is inside the outline and the most any place in it can be. */
interface Square {
  x: number;
  y: number;
  half: number;
  inside: number;
  most: number;
}

function square(outline: Outline, x: number, y: number, half: number): Square {
  const away = edgeDistance(outline, x, y);
  const inside = winding(outline, x, y) !== 0 ? away : -away;
  return { x, y, half, inside, most: inside + half * Math.SQRT2 };
}

/** The squares still to look at, the most promising first. */
class Queue {
  private readonly heap: Square[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(entry: Square): void {
    const heap = this.heap;
    let at = heap.push(entry) - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (heap[parent]!.most >= entry.most) break;
      heap[at] = heap[parent]!;
      at = parent;
    }
    heap[at] = entry;
  }

  pop(): Square | undefined {
    const heap = this.heap;
    const top = heap[0];
    const last = heap.pop();
    if (!top || !last || heap.length === 0) return top;
    let at = 0;
    for (;;) {
      let child = at * 2 + 1;
      if (child >= heap.length) break;
      if (child + 1 < heap.length && heap[child + 1]!.most > heap[child]!.most) child++;
      if (heap[child]!.most <= last.most) break;
      heap[at] = heap[child]!;
      at = child;
    }
    heap[at] = last;
    return top;
  }
}

/** The middle of the widest stretch inside the outline along one of a few level lines: a place inside a sliver no square found. */
function widestStretch(outline: Outline): Point | null {
  const levels = [...new Set(outline.map((point) => point.y))].sort((a, b) => a - b);
  const step = Math.max(1, Math.ceil((levels.length - 1) / MAX_SCANLINES));
  let best: Point | null = null;
  let widest = 0;
  for (let i = 0; i + 1 < levels.length; i += step) {
    const y = (levels[i]! + levels[i + 1]!) / 2;
    const crossings: { x: number; turn: number }[] = [];
    for (let j = 0; j < outline.length; j++) {
      const a = outline[j]!;
      const b = outline[(j + 1) % outline.length]!;
      if ((a.y <= y) === (b.y <= y)) continue;
      crossings.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), turn: a.y <= y ? 1 : -1 });
    }
    crossings.sort((a, b) => a.x - b.x);
    let turns = 0;
    for (let j = 0; j + 1 < crossings.length; j++) {
      turns += crossings[j]!.turn;
      const width = crossings[j + 1]!.x - crossings[j]!.x;
      if (turns !== 0 && width > widest) {
        widest = width;
        best = { x: (crossings[j]!.x + crossings[j + 1]!.x) / 2, y };
      }
    }
  }
  return best;
}

/**
 * The place inside `outline` (a closed run of corners, filled as fog fills it) that lies farthest
 * from its edges, found to a hundredth of the outline's smaller side. Null where the outline
 * encloses nothing: fewer than three corners, a corner that is no place, all of them on one line.
 */
export function areaBadgePoint(outline: Outline): Point | null {
  if (outline.length < 3 || !outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of outline) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const side = Math.min(width, height);
  if (!(side > 0) || !Number.isFinite(width + height)) return null;

  const queue = new Queue();
  const half = side / 2;
  for (let x = minX; x < maxX; x += side) {
    for (let y = minY; y < maxY; y += side) queue.push(square(outline, x + half, y + half, half));
  }
  let best = square(outline, minX + width / 2, minY + height / 2, 0);
  const precision = side * PRECISION;
  for (let looked = 0; looked < MAX_SQUARES; looked++) {
    const next = queue.pop();
    if (!next) break;
    if (next.inside > best.inside) best = next;
    // No place in this square, and so in none of those left, betters the best by more than the precision.
    if (next.most - best.inside <= precision) break;
    const quarter = next.half / 2;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      queue.push(square(outline, next.x + dx * quarter, next.y + dy * quarter, quarter));
    }
  }
  if (best.inside > 0) return { x: best.x, y: best.y };
  return widestStretch(outline);
}
