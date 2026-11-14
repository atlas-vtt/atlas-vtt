/** When a dragged token shows how far it has moved: on every drag, only while a fight runs, or never. */
export type DragDistance = 'always' | 'combat' | 'never';

export const DRAG_DISTANCES: readonly DragDistance[] = ['always', 'combat', 'never'];

export const DEFAULT_DRAG_DISTANCE: DragDistance = 'always';

/** The stored choice; anything else (an older file, a newer Atlas's value) reads as the default. */
export function readDragDistance(value: unknown): DragDistance {
  return DRAG_DISTANCES.find((choice) => choice === value) ?? DEFAULT_DRAG_DISTANCE;
}

/** Whether a token drag shows its distance, given the GM's choice and whether a fight runs (the tracker's combat is started). */
export function showsDragDistance(choice: DragDistance, fightRuns: boolean): boolean {
  return choice === 'always' || (choice === 'combat' && fightRuns);
}
