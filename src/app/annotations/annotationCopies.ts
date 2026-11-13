/**
 * Copies of drawings and texts as they are put on a map (paste, duplicate, an Alt-drag): they
 * keep every field of their originals but their place in the order and their group.
 */

import type { DrawingStroke, TextElement } from '../types';
import { annotationOrder } from './annotationList';

export const newGroupId = (): string => `group_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/**
 * `drawings` and `texts` as copies put down together: in the order their originals lay in among
 * themselves, from `top` upward (`orderOnTop`: above every annotation of the level they land on),
 * and the copies of one group in a group of their own, so a copy never moves with its original.
 * The lists keep their length and order.
 */
export function placedAnnotationCopies(
  drawings: readonly DrawingStroke[],
  texts: readonly TextElement[],
  top: number,
  groupId: () => string = newGroupId,
): { drawings: DrawingStroke[]; texts: TextElement[] } {
  const groups = new Map<string, string>();
  const regrouped = <T extends DrawingStroke | TextElement>(copy: T): T => {
    if (typeof copy.group !== 'string') return { ...copy };
    let group = groups.get(copy.group);
    if (group === undefined) groups.set(copy.group, group = groupId());
    return { ...copy, group };
  };
  const placed = { drawings: drawings.map(regrouped), texts: texts.map(regrouped) };
  // The reader's order: by `order`, and of one order the texts before the drawings (the sort is stable).
  const stack: (DrawingStroke | TextElement)[] = [...placed.texts, ...placed.drawings];
  stack.sort((a, b) => annotationOrder(a) - annotationOrder(b));
  stack.forEach((copy, index) => { copy.order = top + index; });
  return placed;
}
