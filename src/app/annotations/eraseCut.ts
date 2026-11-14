/**
 * What the eraser leaves of a drawing. A sweep is the eraser's path with its radius. No ink is
 * left inside it: a line is cut where its own edge (half its width from its middle) meets the
 * sweep's, so a piece's round end touches the sweep from outside, and a fill loses the part the
 * sweep passed. The pieces are free shapes that keep the look of what they were cut from.
 */

import { inflatePolyline, subtractShapes } from '../lighting/polygonClip';
import type { DrawingStroke } from '../types';
import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import { annotationBounds, boxOutline, inTurnedBox, stampBox } from './annotationBounds';
import { MAX_HOLES, MAX_STROKE_POINTS, type DrawEnds, type DrawingAnnotation, type DrawingInput } from './annotationTypes';
import { isCleanFill, madeClean } from './cleanFills';
import { fillShape } from './drawingInk';
import { windowCut } from './fillWindowCut';
import { inFill, linesDistanceSq, segmentsDistanceSq } from './lineMath';
import { filledParts, lengthQ, onClipGrid, pointsQ, type FilledPart } from './quantized';
import { outsideSweep, type LinePiece } from './sweepCut';

/** The eraser's path, world pixels, and how far from it the eraser reaches. One point is a dab. */
export interface EraseSweep {
  readonly points: readonly Point[];
  readonly radius: number;
}

/** The box around all a sweep reaches. */
function sweepBox({ points, radius }: EraseSweep): Box {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX: minX - radius, minY: minY - radius, maxX: maxX + radius, maxY: maxY + radius };
}

/**
 * Whether the line through `line` (closed for a `loop`) comes within the sweep's reach. `box` is
 * the sweep's own: of a long line nearly every segment lies to one side of it, and is passed over
 * with a comparison.
 */
function reaches(sweep: EraseSweep, box: Box, line: readonly Point[], loop = false): boolean {
  const { points, radius } = sweep;
  const last = loop ? line.length : Math.max(1, line.length - 1);
  for (let i = 0; i < last; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % line.length] ?? a;
    if ((a.x < box.minX && b.x < box.minX) || (a.x > box.maxX && b.x > box.maxX) || (a.y < box.minY && b.y < box.minY) || (a.y > box.maxY && b.y > box.maxY)) continue;
    for (let j = 0; j < Math.max(1, points.length - 1); j++) {
      const c = points[j]!;
      if (segmentsDistanceSq(a, b, c, points[j + 1] ?? c) <= radius * radius) return true;
    }
  }
  return false;
}

/** Whether the sweep passes over a part of the drawing's fill: a point of its path inside it, or its edge within reach. */
function reachesFill(sweep: EraseSweep, box: Box, drawing: DrawingAnnotation): boolean {
  if (sweep.points.some((point) => inFill(point, drawing.points, drawing.holes))) return true;
  return reaches(sweep, box, drawing.points) || drawing.holes.some((hole) => reaches(sweep, box, hole, true));
}

/**
 * The fill less the sweep, as the areas left of it; null where its points lie beyond what the
 * clipping grid holds, and the fill then stays as it is. Cut on that grid: the new edge lies
 * within a quarter pixel of the sweep's. A fill known to be clean is cut around the sweep alone
 * (`windowCut`), so a move over a fill of thousands of points costs what a move over a small one
 * does; every other one is cleaned and cut whole. What is left is clean either way.
 */
function fillLess(drawing: DrawingAnnotation, sweep: EraseSweep): FilledPart[] | null {
  const rings = [drawing.points, ...drawing.holes];
  if (!rings.every((ring) => onClipGrid(ring)) || !onClipGrid(sweep.points, sweep.radius)) return null;
  const swept = inflatePolyline(pointsQ(sweep.points), Math.max(1, lengthQ(sweep.radius)));
  const around = isCleanFill(drawing) ? windowCut(drawing.points, drawing.holes, swept) : null;
  if (around) return around;
  const fill = fillShape(drawing.points, drawing.holes);
  return fill && filledParts(subtractShapes(fill, swept));
}

/** Whether a drawing of this outline and these holes is read whole (`annotationList`): one that is not must never be written. */
export function readable({ outline, holes }: FilledPart): boolean {
  return outline.length < MAX_STROKE_POINTS && holes.length <= MAX_HOLES && holes.reduce((sum, hole) => sum + hole.length, 0) <= MAX_STROKE_POINTS;
}

/** Every field of the record but the three the store gives a drawing: what a piece starts from, so it keeps fields this Atlas does not know. */
export function keptFields(record: DrawingStroke): DrawingInput {
  const kept: Partial<DrawingStroke> = { ...record };
  delete kept.id;
  delete kept.kind;
  delete kept.timestamp;
  return kept as DrawingInput;
}

/**
 * The arrowheads a piece of an open line keeps: the ones at the ends it still has. A piece with
 * only the start's head is turned round, since a line's one head is at its end.
 */
function pieceEnds(piece: LinePiece, ends: DrawEnds | null): { points: Point[]; ends: DrawEnds | null } {
  if (ends && piece.toEnd) return { points: piece.points, ends: ends === 'both' && piece.fromStart ? 'both' : 'end' };
  if (ends === 'both' && piece.fromStart) return { points: [...piece.points].reverse(), ends: 'end' };
  return { points: piece.points, ends: null };
}

/** A piece of the line: a pen's stroke stays one, every other line is a free line. No fill, and no hints of the shape it was. */
function linePiece(kept: DrawingInput, drawing: DrawingAnnotation, piece: LinePiece): DrawingInput {
  const { points, ends } = pieceEnds(piece, drawing.ends);
  const line: DrawingInput = { ...kept, type: drawing.shape === 'pen' ? 'pen' : 'line', points };
  delete line.anchors;
  delete line.fill;
  delete line.holes;
  delete line.ends;
  if (ends) line.ends = ends;
  return line;
}

/** A piece of the fill: a closed line without a width, with the rings cut out of it. */
export function fillPiece(kept: DrawingInput, part: FilledPart): DrawingInput {
  const fill: DrawingInput = { ...kept, type: 'line', points: [...part.outline, { ...part.outline[0]! }], width: 0 };
  delete fill.anchors;
  delete fill.dash;
  delete fill.ends;
  delete fill.holes;
  if (part.holes.length > 0) fill.holes = part.holes;
  return fill;
}

/**
 * What `sweep` leaves of `drawing`: `'untouched'` when it reaches none of it, else the drawings
 * that take its place, none when all of it is gone. With `whole`, a touched drawing goes whole.
 *
 * - A line is cut exactly where the sweep comes within half the line's width of its middle. The
 *   pieces of an open arrow keep the heads at the ends they still have.
 * - A filled drawing gives the pieces of its outline and, apart from them, its fill less the
 *   sweep: closed lines without a width, with `holes` where the sweep dabbed its inside.
 * - A stamp goes whole when the sweep reaches its box.
 *
 * Every piece keeps every other field of the drawing's record. Where a drawing comes apart into
 * several, they share one `group`: the drawing's own, or else its id.
 *
 * `'full'` where a piece would have more points or holes than a drawing may: the reader would pass
 * it over or read it without some of its holes, so the cut is not made and the drawing stays.
 */
export function cutBySweep(drawing: DrawingAnnotation, sweep: EraseSweep, whole: boolean): DrawingInput[] | 'untouched' | 'full' {
  const { points, radius } = sweep;
  if (points.length === 0 || !(radius > 0) || !Number.isFinite(radius)) return 'untouched';
  const bounds = annotationBounds(drawing);
  const box = sweepBox(sweep);
  // A line's bounds hold its ink, so a sweep whose own box stays clear of them reaches nothing.
  if (box.minX > bounds.maxX || box.maxX < bounds.minX || box.minY > bounds.maxY || box.maxY < bounds.minY) return 'untouched';
  if (drawing.shape === 'stamp') {
    const stamp = stampBox(drawing);
    return points.some((point) => inTurnedBox(point, stamp)) || linesDistanceSq(points, boxOutline(stamp)) <= radius * radius ? [] : 'untouched';
  }
  const inked = drawing.width > 0;
  const filled = drawing.fill !== null && drawing.closed;
  const cut = inked ? outsideSweep(drawing.points, points, radius + drawing.width / 2, drawing.closed) : null;
  const dabbed = filled && reachesFill(sweep, box, drawing);
  if (!cut && !dabbed) return 'untouched';
  if (whole) return [];

  const kept = keptFields(drawing.record);
  const pieces: DrawingInput[] = [];
  const lines: LinePiece[] = cut ?? (inked ? [{ points: drawing.points.map(({ x, y }) => ({ x, y })), fromStart: true, toEnd: true }] : []);
  for (const line of lines) {
    if (line.points.length > MAX_STROKE_POINTS) return 'full';
    pieces.push(linePiece(kept, drawing, line));
  }
  if (filled) {
    const left = dabbed ? fillLess(drawing, sweep) : null;
    // Whatever a cut leaves is clean; a fill that stays as it is, is what it was.
    const clean = left !== null || isCleanFill(drawing);
    const parts = left ?? [{ outline: drawing.points.slice(0, -1).map(({ x, y }) => ({ x, y })), holes: drawing.holes.map((hole) => hole.map(({ x, y }) => ({ x, y }))) }];
    for (const part of parts) {
      if (!readable(part)) return 'full';
      const piece = fillPiece(kept, part);
      if (clean) madeClean(piece);
      pieces.push(piece);
    }
  }
  if (pieces.length > 1) {
    const group = drawing.group ?? drawing.id;
    for (const piece of pieces) piece.group = group;
  }
  return pieces;
}

/** What `sweep` leaves of `drawing` (`cutBySweep`), for whoever has nobody to tell of a cut that cannot be made: the drawing is then `'untouched'`. */
export function erased(drawing: DrawingAnnotation, sweep: EraseSweep, whole: boolean): DrawingInput[] | 'untouched' {
  const cut = cutBySweep(drawing, sweep, whole);
  return cut === 'full' ? 'untouched' : cut;
}
