/** What the annotation actions write into a draft of the view store: one drawing made, changed, moved or removed. */

import type { DrawingInput } from '../annotations/annotationTypes';
import { placedOnViewedLevel, type LevelView } from '../levels/sceneLevels';
import type { DrawingStroke, TextElement } from '../types';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';

/** The part of a draft the annotation writes reach. */
export interface AnnotationsDraft extends LevelView {
  objects: { drawings: Record<string, DrawingStroke>; texts: Record<string, TextElement> };
  selectedIds: string[];
}

/** No drawing can be without these: a change that names one as undefined leaves it. */
const DRAWING_NEEDS = new Set<string>(['type', 'points', 'color', 'width', 'opacity']);
/** Nor any text without these. Its `width` and `opacity` are its own to lose: a text without a width is as wide as its words. */
const TEXT_NEEDS = new Set<string>(['x', 'y', 'text', 'fontSize', 'fontFamily', 'color']);

export const newAnnotationId = (prefix: 'drawing' | 'text'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/** A copy of a list of points: what a caller hands in may be frozen, and the store's own must not be shared. */
export const copiedPoints = (points: ReadonlyArray<Point>): Point[] => points.map(({ x, y }) => ({ x, y }));

const isPath = (value: unknown): value is Point[] => Array.isArray(value) && value.every((point) => isRecord(point));

/** A value as the store may keep it: lists are copied. */
function owned(field: string, value: unknown): unknown {
  if ((field === 'points' || field === 'anchors') && isPath(value)) return copiedPoints(value);
  if (field === 'holes' && Array.isArray(value) && value.every(isPath)) return value.map(copiedPoints);
  if (field === 'breaks' && Array.isArray(value)) return [...value as unknown[]];
  return value;
}

/**
 * A drawing made from `data` on the level `draft` shows, under a new id. `order` is the place it
 * takes where its data names none; undefined leaves such a drawing without one.
 */
export function newDrawing(draft: LevelView, data: DrawingInput, order: number | undefined): DrawingStroke {
  const { points, anchors, holes, ...rest } = data;
  return {
    id: newAnnotationId('drawing'),
    kind: 'drawing',
    timestamp: Date.now(),
    ...rest,
    points: copiedPoints(points),
    ...(anchors && { anchors: copiedPoints(anchors) }),
    ...(holes && { holes: holes.map(copiedPoints) }),
    ...(rest.order === undefined && order !== undefined && { order }),
    ...placedOnViewedLevel(draft),
  };
}

function change(entry: DrawingStroke | TextElement, changes: Readonly<Record<string, unknown>>, fields: readonly string[], needs: ReadonlySet<string>): void {
  for (const field of fields) {
    if (!(field in changes)) continue;
    const value = changes[field];
    if (value !== undefined) Reflect.set(entry, field, owned(field, value));
    else if (!needs.has(field)) Reflect.deleteProperty(entry, field);
  }
}

/** Writes `changes` to a drawing: those of `fields` they name, undefined removing what a drawing can be without. */
export function changeDrawing(drawing: DrawingStroke, changes: Readonly<Record<string, unknown>>, fields: readonly string[]): void {
  change(drawing, changes, fields, DRAWING_NEEDS);
}

/** Writes `changes` to a text: those of `fields` they name, undefined removing what a text can be without. */
export function changeText(text: TextElement, changes: Readonly<Record<string, unknown>>, fields: readonly string[]): void {
  change(text, changes, fields, TEXT_NEEDS);
}

function shift(points: unknown, dx: number, dy: number): void {
  if (!Array.isArray(points)) return;
  for (const point of points as unknown[]) {
    if (!isRecord(point) || typeof point.x !== 'number' || typeof point.y !== 'number') continue;
    point.x += dx;
    point.y += dy;
  }
}

/** Moves a drawing by (dx, dy): its points, and the anchors and holes that lie with them. */
export function shiftDrawing(drawing: DrawingStroke, dx: number, dy: number): void {
  shift(drawing.points, dx, dy);
  shift(drawing.anchors, dx, dy);
  if (Array.isArray(drawing.holes)) for (const ring of drawing.holes) shift(ring, dx, dy);
}

/** Removes drawings and texts by id and takes them out of the selection. */
export function removeAnnotations(draft: AnnotationsDraft, ids: Iterable<string>): void {
  const { drawings, texts } = draft.objects;
  const gone = new Set<string>();
  for (const id of ids) {
    if (!drawings[id] && !texts[id]) continue;
    delete drawings[id];
    delete texts[id];
    gone.add(id);
  }
  if (gone.size > 0) draft.selectedIds = draft.selectedIds.filter((id) => !gone.has(id));
}
