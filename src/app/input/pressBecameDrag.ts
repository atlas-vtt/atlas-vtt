/**
 * A finger that rests on something may be about to drag it (a tile lifted after a quarter of a
 * second) or to open its menu (a long press, a little later). Whoever lifts the thing says so
 * here, and the long press under way is dropped: one press is a drag or a menu, never both.
 */
const listeners = new Set<() => void>();

/** The press under way became a drag. */
export function pressBecameDrag(): void {
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` whenever a press becomes a drag; returns the call that stops it. */
export function onPressBecameDrag(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
