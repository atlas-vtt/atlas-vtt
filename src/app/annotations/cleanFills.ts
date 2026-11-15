/**
 * Which fills are known to need no cleaning: an outline that does not cross itself, on the
 * clipping grid, with its holes inside it and apart. Every fill a cut leaves is one (the clipping
 * library made its rings), and for such a fill nothing has to be worked out to draw it, and a
 * further cut can be made where the eraser is alone (`fillWindowCut.ts`).
 *
 * Known for as long as the record lives in this window: a fill read from a file is cleaned like
 * any other until it is cut again.
 */

import type { DrawingStroke } from '../types';
import type { Point } from '../types/visionTypes';
import type { DrawingAnnotation, DrawingInput } from './annotationTypes';

/** The `points` of pieces made clean, before the store has them. */
const made = new WeakSet<readonly Point[]>();
/** The `points` of records that are clean, with the `holes` they had then (a record's arrays are never changed, only replaced). */
const records = new WeakMap<readonly Point[], unknown>();

/** Says that `piece`, as it is now, is a clean fill. */
export function madeClean(piece: DrawingInput): void {
  made.add(piece.points);
}

/**
 * The store copies what it is handed: tells that the records it made of `pieces` (`ids`, in their
 * order, among `drawings`) are the clean fills those were.
 */
export function cleanFillsWritten(pieces: readonly DrawingInput[], ids: readonly string[], drawings: Readonly<Record<string, DrawingStroke>>): void {
  pieces.forEach((piece, index) => {
    const record = drawings[ids[index] ?? ''];
    if (record && made.has(piece.points)) records.set(record.points, record.holes);
  });
}

/** Whether `drawing` is a fill known to need no cleaning, read whole. */
export function isCleanFill(drawing: DrawingAnnotation): boolean {
  const { record } = drawing;
  if (drawing.points !== record.points || !records.has(record.points) || records.get(record.points) !== record.holes) return false;
  return drawing.holes.length === (record.holes?.length ?? 0);
}
