/**
 * How a line is drawn beyond its plain stroke: its dashes, its arrowheads, and the outline of its
 * ink for a see-through line, which must be no darker where it crosses itself. All as points; who
 * draws them strokes the dashes with round ends and fills the heads and the outline.
 */

import { inflatePolylines, normalizePolygon, unionShapes } from '../lighting/polygonClip';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { isClosedPath } from './annotationFit';
import type { DrawDash, DrawEnds } from './annotationTypes';
import { pathLength } from './lineMath';
import { filledParts, lengthQ, onClipGrid, pointsQ, type FilledPart } from './quantized';

/**
 * A dash and the gap after it, in widths of the line, along its middle. The round ends add half a
 * width to each end of a dash, so the ink is four widths on and two off.
 */
const DASHED = { on: 3, off: 3 };
/** A dot is a round end with no length; the dots stand two widths apart, a width of gap between them. */
const DOT_PITCH = 2;
/** The most dashes or dots one line is cut into; a longer line's are stretched. */
const MAX_DASHES = 10_000;
/** An arrowhead's length and its width at the barbs, in widths of the line. */
const HEAD_LENGTH = 4;
const HEAD_WIDTH = 3.5;

/** How far an arrowhead's barbs stand out from the middle of a line `width` wide: what the line's bounds must hold. */
export function arrowReach(width: number): number {
  return (HEAD_WIDTH * width) / 2;
}

/** Walks a line by its length: the point at a distance from its start, and the stretch between two distances. */
class Walk {
  private segment = 0;
  /** The length of the line before `segment`. */
  private before = 0;
  private readonly lengths: number[] = [];

  constructor(private readonly points: readonly Point[]) {
    for (let i = 1; i < points.length; i++) this.lengths.push(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  }

  /** Moves to the segment that holds `distance`; distances must not go back. */
  private seek(distance: number): void {
    while (this.segment < this.lengths.length - 1 && this.before + this.lengths[this.segment]! < distance) {
      this.before += this.lengths[this.segment]!;
      this.segment++;
    }
  }

  at(distance: number): Point {
    this.seek(distance);
    const a = this.points[this.segment]!;
    const b = this.points[this.segment + 1] ?? a;
    const length = this.lengths[this.segment] ?? 0;
    const t = length > 0 ? Math.max(0, Math.min(1, (distance - this.before) / length)) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** The line from `from` to `to`, with the corners it passes. */
  stretch(from: number, to: number): Point[] {
    const piece = [this.at(from)];
    let segment = this.segment;
    let end = this.before + (this.lengths[segment] ?? 0);
    while (segment < this.lengths.length - 1 && end < to) {
      if (end > from) piece.push({ x: this.points[segment + 1]!.x, y: this.points[segment + 1]!.y });
      segment++;
      end += this.lengths[segment]!;
    }
    piece.push(this.at(to));
    return piece;
  }
}

/**
 * The dashes or dots of the line through `points`, each a line of its own; a dot is one point.
 * They are fitted to the line, so that an open line begins and ends with a whole dash or a dot and
 * a closed one has no odd gap where it closes, and they run on around corners. None for a line
 * without a width.
 */
export function dashes(points: readonly Point[], width: number, dash: DrawDash): Point[][] {
  const first = points[0];
  if (!first || !(width > 0) || !Number.isFinite(width)) return [];
  const length = pathLength(points);
  if (!(length > 0)) return [[{ x: first.x, y: first.y }]];
  const loop = isClosedPath(points);
  const walk = new Walk(points);
  if (dash === 'dotted') {
    const fitted = Math.round(length / (DOT_PITCH * width));
    const count = Math.min(MAX_DASHES, loop ? Math.max(1, fitted) : Math.max(2, fitted + 1));
    const pitch = length / (loop ? count : count - 1);
    return Array.from({ length: count }, (_, i) => [walk.at(i * pitch)]);
  }
  const on = DASHED.on * width;
  const off = DASHED.off * width;
  // An open line of n dashes has n − 1 gaps; a closed one a gap after every dash.
  const count = Math.min(MAX_DASHES, Math.max(1, Math.round((loop ? length : length + off) / (on + off))));
  const scale = length / (loop ? count * (on + off) : count * on + (count - 1) * off);
  const pieces: Point[][] = [];
  for (let i = 0; i < count; i++) {
    const from = i * (on + off) * scale;
    pieces.push(walk.stretch(from, Math.min(length, from + on * scale)));
  }
  return pieces;
}

/** How much of a line's length one arrowhead takes: its full length, or half the line where the line is shorter than two heads. */
function headLength(points: readonly Point[], width: number): number {
  return Math.min(HEAD_LENGTH * width, pathLength(points) / 2);
}

/**
 * The arrowhead at the start or the end of the line through `points`: its tip, which is the
 * line's end, and its two barbs. It points the way the line arrives over the head's own length,
 * so a curve's head lies along the curve. Null for a line without a length or a width.
 */
export function arrowHead(points: readonly Point[], width: number, at: 'start' | 'end'): Point[] | null {
  if (points.length < 2 || !(width > 0) || !Number.isFinite(width)) return null;
  const length = headLength(points, width);
  if (!(length > 0)) return null;
  const line = at === 'end' ? [...points].reverse() : points;
  const tip = line[0]!;
  const neck = new Walk(line).at(length);
  const reach = Math.hypot(neck.x - tip.x, neck.y - tip.y);
  if (!(reach > 0)) return null;
  const backX = (neck.x - tip.x) / reach;
  const backY = (neck.y - tip.y) / reach;
  // A head shortened to fit a short line keeps its shape.
  const half = ((HEAD_WIDTH / HEAD_LENGTH) * length) / 2;
  const baseX = tip.x + backX * length;
  const baseY = tip.y + backY * length;
  return [{ x: tip.x, y: tip.y }, { x: baseX - backY * half, y: baseY + backX * half }, { x: baseX + backY * half, y: baseY - backX * half }];
}

/**
 * The line through `points` between its arrowheads: cut back to where each head begins, so that
 * its round end lies in the head and does not blunt the tip.
 */
export function shaft(points: readonly Point[], width: number, ends: DrawEnds): Point[] {
  const total = pathLength(points);
  const head = points.length < 2 || !(width > 0) ? 0 : headLength(points, width);
  if (!(head > 0)) return points.map(({ x, y }) => ({ x, y }));
  return new Walk(points).stretch(ends === 'both' ? head : 0, total - head);
}

/**
 * The ink of lines `width` wide with round joins and round ends, and of `shapes` filled, as areas
 * that do not overlap: filled once, they are one even tone where the lines cross each other,
 * themselves or the shapes. `shapes` are outlines (arrowheads), filled by the nonzero rule.
 *
 * Worked out on the clipping grid: the outline lies within a quarter pixel of the exact one (an
 * eighth for the grid's rounding of points and width, an eighth for the corners of its round
 * parts). Nothing for points the grid cannot hold.
 */
export function inkOutline(lines: readonly (readonly Point[])[], width: number, shapes: readonly (readonly Point[])[] = []): FilledPart[] {
  if (![...lines, ...shapes].every((points) => onClipGrid(points, Math.max(0, width)))) return [];
  const radius = width > 0 && Number.isFinite(width) ? Math.max(1, lengthQ(width / 2)) : 0;
  let ink: QShape = inflatePolylines(lines.filter((line) => line.length > 0).map(pointsQ), radius);
  for (const shape of shapes) {
    if (shape.length >= 3) ink = unionShapes(ink, normalizePolygon(pointsQ(shape)));
  }
  return filledParts(ink);
}

/** The ink of one line `width` wide (see `inkOutline`): what a see-through stroke is filled as. */
export function strokeOutline(points: readonly Point[], width: number): FilledPart[] {
  return inkOutline([points], width);
}
