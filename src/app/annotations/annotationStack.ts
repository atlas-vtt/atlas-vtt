/**
 * The one order drawings and texts of a level lie in, as the store's writes need it: what is on
 * top, and the orders that bring some of them to the front or the back. Read from the store's
 * state as it is, never from a draft of it, so that a write touches only what it changes.
 */

import { hasLevels, onLevel, viewedLevelId, type LevelView } from '../levels/sceneLevels';
import { isRecord } from '../utils/guards';
import { annotationOrder, type AnnotationRecords } from './annotationList';

/** What the stack reads of a view's state. */
export type AnnotationStackState = { objects: AnnotationRecords } & LevelView;

/** One annotation of a level's stack: where the store keeps it and where it lies. */
export interface StackedAnnotation {
  id: string;
  kind: 'texts' | 'drawings';
  /** The entry as the record holds it; a file's entry may be anything that is an object. */
  entry: Readonly<Record<string, unknown>>;
  order: number;
}

/** A new place in the order for one annotation. */
export interface AnnotationReorder {
  id: string;
  kind: 'texts' | 'drawings';
  order: number;
}

/**
 * The drawings and texts of the level `state` shows, lowest first, as `annotationList` orders
 * them: by `order`, and of one order the texts before the drawings, each in its record's order.
 * Every entry that is an object counts, also one no reader shows: it holds a place in the file.
 */
export function annotationStack(state: AnnotationStackState): StackedAnnotation[] {
  const { levels } = state;
  const levelId = hasLevels(levels) ? viewedLevelId(state) : null;
  const stack: StackedAnnotation[] = [];
  for (const kind of ['texts', 'drawings'] as const) {
    const record: unknown = state.objects[kind];
    if (!isRecord(record)) continue;
    for (const [id, entry] of Object.entries(record)) {
      if (isRecord(entry) && (levelId === null || onLevel(entry, levelId, levels))) stack.push({ id, kind, entry, order: annotationOrder(entry) });
    }
  }
  return stack.sort((a, b) => a.order - b.order);
}

/** The order one above every annotation of the level shown: what a new one gets. At least 1, so it lies over every annotation made before there was an order. */
export function orderOnTop(state: AnnotationStackState): number {
  return annotationStack(state).reduce((highest, { order }) => Math.max(highest, order), 0) + 1;
}

/**
 * The orders that put the annotations `ids` above (`front`) or below (`back`) every other one of
 * `stack`, keeping the order they have among themselves. None where they already lie so, or where
 * the stack holds none of them.
 */
export function reordered(stack: readonly StackedAnnotation[], ids: Iterable<string>, to: 'front' | 'back'): AnnotationReorder[] {
  const wanted = new Set(ids);
  const moved = stack.filter(({ id }) => wanted.has(id));
  if (moved.length === 0) return [];
  const edge = to === 'front' ? stack.slice(-moved.length) : stack.slice(0, moved.length);
  if (edge.every(({ id }, index) => moved[index]?.id === id)) return [];
  const first = to === 'front' ? stack[stack.length - 1]!.order + 1 : stack[0]!.order - moved.length;
  return moved.map(({ id, kind }, index) => ({ id, kind, order: first + index }));
}
