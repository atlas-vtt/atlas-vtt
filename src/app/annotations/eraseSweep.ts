/**
 * One sweep of the eraser over a level's annotations: which drawings go and what takes their
 * place (`erased`), and which texts go whole. The index names the few the sweep can reach, so a
 * level full of drawings costs a sweep no more than the ones it passes.
 */

import { boxOutline, inTurnedBox, textBox, type TextMeasure } from './annotationBounds';
import type { AnnotationIndex } from './annotationHit';
import { isLocked } from './annotationLock';
import type { DrawingInput, TextAnnotation } from './annotationTypes';
import { cutBySweep, type EraseSweep } from './eraseCut';
import { linesDistanceSq } from './lineMath';

/** What a sweep changes: one `replaceDrawings` and one `deleteAnnotations`. */
export interface SweepChange {
  /** The drawings the sweep reached, which go. */
  readonly removed: string[];
  /** What is left of them. */
  readonly added: DrawingInput[];
  /** The texts the sweep reached, which go whole. */
  readonly texts: string[];
  /** The sweep reached a drawing it could not cut, which stays as it is: what would be left of it has more points than a drawing may. */
  full?: true;
}

function reachesText(sweep: EraseSweep, text: TextAnnotation, measure: TextMeasure | undefined): boolean {
  const box = textBox(text, measure);
  if (sweep.points.some((point) => inTurnedBox(point, box, sweep.radius))) return true;
  return linesDistanceSq(sweep.points, boxOutline(box)) <= sweep.radius * sweep.radius;
}

/**
 * What `sweep` changes of the annotations in `index`, or null where it reaches none: a drawing is
 * cut, or goes whole where `whole` says so; a text goes whole. A locked annotation is left alone:
 * its lock is against exactly this. A drawing that can take no further cut stays too, and the
 * change says so (`full`), also where it is all the sweep reached.
 */
export function sweepChange(index: AnnotationIndex, sweep: EraseSweep, whole: boolean): SweepChange | null {
  const { points, radius } = sweep;
  if (points.length === 0 || !(radius > 0)) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const change: SweepChange = { removed: [], added: [], texts: [] };
  for (const annotation of index.touching({ minX: minX - radius, minY: minY - radius, maxX: maxX + radius, maxY: maxY + radius })) {
    if (isLocked(annotation)) continue;
    if (annotation.kind === 'text') {
      if (reachesText(sweep, annotation, index.measure)) change.texts.push(annotation.id);
      continue;
    }
    const pieces = cutBySweep(annotation, sweep, whole);
    if (pieces === 'untouched') continue;
    if (pieces === 'full') {
      change.full = true;
      continue;
    }
    change.removed.push(annotation.id);
    change.added.push(...pieces);
  }
  return change.removed.length > 0 || change.texts.length > 0 || change.full ? change : null;
}
