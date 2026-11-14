/**
 * What a lock is against. A locked drawing or text takes one change, the one that unlocks it: it
 * is not moved, turned, scaled, restyled, reworded, reordered, hidden, put on another layer, erased
 * or deleted, alone or as one of several (the others still change). Copying it is no change of it,
 * and its copy is not locked. Clearing a level removes it with the rest (`clearAnnotations`).
 *
 * The store's actions ask here, so every way to them (the bars, the menu, the keys, the eraser, a
 * drag) is refused alike.
 */

/** What a lock is read from: a drawing or text as the store keeps it, or as it is read (`Annotation`). */
interface Lockable {
  readonly locked?: unknown;
}

/** The records ids are looked up in. */
interface LockableObjects {
  readonly drawings: Readonly<Record<string, Lockable | undefined>>;
  readonly texts: Readonly<Record<string, Lockable | undefined>>;
}

/** Whether `entry` is locked; a lock counts only where it is `true`, as the reader takes it. */
export const isLocked = (entry: Lockable | undefined): boolean => entry?.locked === true;

/** Whether `changes` unlock what they are written to: they name `locked` as removed. */
export const unlocks = (changes: Readonly<Record<string, unknown>>): boolean => 'locked' in changes && changes.locked === undefined;

/**
 * What of `changes` is written to `entry`: all of it where the entry is not locked; of a locked
 * one its unlocking alone, whatever else the changes name; null where it takes nothing.
 */
export function changesTaken<Changes extends Readonly<Record<string, unknown>>>(entry: Lockable, changes: Changes): Changes | { locked: undefined } | null {
  if (!isLocked(entry)) return changes;
  return unlocks(changes) ? { locked: undefined } : null;
}

/** Those of `ids` whose drawing or text is not locked, in their order; an id of neither stays, as there is nothing to refuse. */
export function unlockedIds(ids: readonly string[], objects: LockableObjects): string[] {
  return ids.filter((id) => !isLocked(objects.drawings[id]) && !isLocked(objects.texts[id]));
}

/** A copy of a drawing or text: every field but its lock. */
export function unlockedCopy<Entry extends object>(entry: Entry): Entry {
  const copy = { ...entry };
  Reflect.deleteProperty(copy, 'locked');
  return copy;
}
