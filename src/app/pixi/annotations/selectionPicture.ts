import type { TextMeasure } from '../../annotations/annotationBounds';
import { frameCorners, frameOfAnnotation } from '../../annotations/annotationFrame';
import { HANDLE_LOOK } from '../../annotations/annotationHandles';
import type { Annotation } from '../../annotations/annotationTypes';
import type { Point } from '../../types/visionTypes';
import type { HandlesPicture } from './AnnotationHandles';
import type { SelectionRead } from './annotationSelection';

/** So many selected annotations still get an outline each; more are shown by their frame alone. */
const MAX_OUTLINES = 100;

/**
 * The outline of one annotation at `zoom`: the corners of its own frame, standing off its ink as
 * the selection's frame does. What marks it under the pointer, and among several selected.
 */
export function outlineOf(annotation: Annotation, zoom: number, measure: TextMeasure): Point[] {
  const ink = annotation.kind === 'drawing' && annotation.shape !== 'stamp' ? annotation.width / 2 : 0;
  return frameCorners(frameOfAnnotation(annotation, measure), ink + HANDLE_LOOK.gap / zoom);
}

/**
 * What the handles show of a selection as the store has it: its frame with its handles, and an
 * outline for each of several and for a locked one, which the frame alone does not tell apart.
 * Null where the handles frame nothing.
 */
export function selectionPicture(read: SelectionRead, zoom: number, measure: TextMeasure): HandlesPicture | null {
  const { framed, handles } = read;
  if (framed.length === 0) return null;
  const outlined = framed.length > 1 || !handles ? framed.slice(0, MAX_OUTLINES) : [];
  return { handles, outlines: outlined.map((annotation) => outlineOf(annotation, zoom, measure)) };
}
