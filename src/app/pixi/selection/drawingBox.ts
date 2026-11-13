import { annotationBounds } from '../../annotations/annotationBounds';
import { readDrawing } from '../../annotations/annotationList';
import type { DrawingAnnotation } from '../../annotations/annotationTypes';
import type { Box } from './selectionGeometry';

/** The box around everything `drawing` shows: its line with its width and arrowheads, a stamp's turned footprint. */
export function drawingBox(drawing: DrawingAnnotation): Box {
  const { minX, minY, maxX, maxY } = annotationBounds(drawing);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The box around the entry `id` of a drawings record as it is read; null for one that is no drawing. */
export function drawingRecordBox(id: string, record: unknown): Box | null {
  const drawing = readDrawing(id, record);
  return drawing ? drawingBox(drawing) : null;
}
