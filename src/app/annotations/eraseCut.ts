/**
 * What the eraser leaves of a drawing. A sweep is the eraser's path with its radius. No ink is
 * left inside it: a line is cut where its own edge (half its width from its middle) meets the
 * sweep's, so a piece's round end touches the sweep from outside, and a fill loses the part the
 * sweep passed. The pieces are free shapes that keep the look of what they were cut from.
 */

import { inflatePolyline, normalizePolygon, subtractShapes } from '../lighting/polygonClip';
import type { DrawingStroke } from '../types';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { annotationBounds, boxOutline, inTurnedBox, stampBox } from './annotationBounds';
import type { DrawEnds, DrawingAnnotation, DrawingInput } from './annotationTypes';
import { inFill, linesDistanceSq } from './lineMath';
import { filledParts, lengthQ, onClipGrid, pointsQ, type FilledPart } from './quantized';
import { outsideSweep, type LinePiece } from './sweepCut';

/** The eraser's path, world pixels, and how far from it the eraser reaches. One point is a dab. */
export interface EraseSweep {
  readonly points: readonly Point[];
  readonly radius: number;
}

function reaches(sweep: EraseSweep, line: readonly Point[]): boolean {
  return linesDistanceSq(sweep.points, line) <= sweep.radius * sweep.radius;
}

/** Whether the sweep passes over a part of the drawing's fill: a point of its path inside it, or its edge within reach. */
function reachesFill(sweep: EraseSweep, drawing: DrawingAnnotation): boolean {
  if (sweep.points.some((point) => inFill(point, drawing.points, drawing.holes))) return true;
  return reaches(sweep, drawing.points) || drawing.holes.some((hole) => reaches(sweep, [...hole, hole[0]!]));
}

/**
 * The fill less the sweep, as the areas left of it; null where its points lie beyond what the
 * clipping grid holds, and the fill then stays as it is. Cut on that grid: the new edge lies
 * within a quarter pixel of the sweep's.
 */
function fillLess(drawing: DrawingAnnotation, sweep: EraseSweep): FilledPart[] | null {
  const rings = [drawing.points, ...drawing.holes];
  if (!rings.every((ring) => onClipGrid(ring)) || !onClipGrid(sweep.points, sweep.radius)) return null;
  let fill: QShape = normalizePolygon(pointsQ(drawing.points.slice(0, -1)));
  for (const hole of drawing.holes) fill = subtractShapes(fill, normalizePolygon(pointsQ(hole)));
  return filledParts(subtractShapes(fill, inflatePolyline(pointsQ(sweep.points), Math.max(1, lengthQ(sweep.radius)))));
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
 */
export function erased(drawing: DrawingAnnotation, sweep: EraseSweep, whole: boolean): DrawingInput[] | 'untouched' {
  const { points, radius } = sweep;
  if (points.length === 0 || !(radius > 0) || !Number.isFinite(radius)) return 'untouched';
  const bounds = annotationBounds(drawing);
  // A line's bounds hold its ink, so a sweep whose own box stays a radius clear of them reaches nothing.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX - radius > bounds.maxX || maxX + radius < bounds.minX || minY - radius > bounds.maxY || maxY + radius < bounds.minY) return 'untouched';
  if (drawing.shape === 'stamp') {
    const box = stampBox(drawing);
    return points.some((point) => inTurnedBox(point, box)) || reaches(sweep, boxOutline(box)) ? [] : 'untouched';
  }
  const inked = drawing.width > 0;
  const filled = drawing.fill !== null && drawing.closed;
  const cut = inked ? outsideSweep(drawing.points, points, radius + drawing.width / 2, drawing.closed) : null;
  const dabbed = filled && reachesFill(sweep, drawing);
  if (!cut && !dabbed) return 'untouched';
  if (whole) return [];

  const kept = keptFields(drawing.record);
  const pieces: DrawingInput[] = [];
  const lines: LinePiece[] = cut ?? (inked ? [{ points: drawing.points.map(({ x, y }) => ({ x, y })), fromStart: true, toEnd: true }] : []);
  for (const line of lines) pieces.push(linePiece(kept, drawing, line));
  if (filled) {
    const parts = (dabbed ? fillLess(drawing, sweep) : null) ?? [{ outline: drawing.points.slice(0, -1).map(({ x, y }) => ({ x, y })), holes: drawing.holes.map((hole) => hole.map(({ x, y }) => ({ x, y }))) }];
    for (const part of parts) pieces.push(fillPiece(kept, part));
  }
  if (pieces.length > 1) {
    const group = drawing.group ?? drawing.id;
    for (const piece of pieces) piece.group = group;
  }
  return pieces;
}
