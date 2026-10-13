import { changedKeys, EntryList, isKey, isPlainRecord, orderChanged, type Entries } from './keyOrder';
import { BRANCH_DEPTH, TRACKED_BRANCHES, type HistorySnapshot } from './trackedSlice';

/** Depth of `objects`, whose keys are collections: one absent there counts as empty. */
const COLLECTIONS = 2;
const EMPTY: Entries = Object.freeze({});

/**
 * Moves `current` towards `to` by what a step changed between `from` and `to`, `depth` levels
 * deep (objects → collections → entities). What the step left alone keeps its value now;
 * where nothing else changed since (`current` is `from`), `to` itself comes back.
 */
export function towards(current: unknown, from: unknown, to: unknown, depth: number): unknown {
  if (from === to) return current;
  if (current === from) return to;
  if (depth === 0 || !isPlainRecord(current) || !isPlainRecord(from) || !isPlainRecord(to)) return to;
  return mergeRecord(current, from, to, depth);
}

/** A collection of `objects` towards its other side; an absent collection counts as an empty one. */
function towardsCollection(current: unknown, from: unknown, to: unknown): unknown {
  return towards(current ?? EMPTY, from ?? EMPTY, to ?? EMPTY, COLLECTIONS - 1);
}

/**
 * Rebuilds `current` with the keys the step changed: a key still there is written in its
 * place, one missing is placed at its index in `to`, one `to` lacks goes, and keys only
 * `current` holds (added since) stay. When the step itself reordered keys, every key of
 * either side is placed as `to` orders it; one that only moved and is gone now stays gone.
 */
function mergeRecord(current: Entries, from: Entries, to: Entries, depth: number): Entries {
  const reordered = orderChanged(from, to);
  const indexInTo = new Map(Object.keys(to).map((key, index) => [key, index]));
  const entries = new EntryList(current);
  for (const key of changedKeys(from, to, reordered)) {
    const inTo = isKey(to, key);
    const inCurrent = isKey(current, key);
    if (depth === COLLECTIONS) {
      const merged = towardsCollection(current[key], from[key], to[key]);
      // A collection the step created goes only once nothing added since is left in it.
      if (!inTo && (!inCurrent || (isPlainRecord(merged) && Object.keys(merged).length === 0))) {
        entries.remove(key);
        continue;
      }
      if (!inTo) {
        entries.set(key, merged);
        continue;
      }
      if (inCurrent && !reordered) entries.set(key, merged);
      else if (inCurrent || !onlyMoved(from, to, key)) entries.insert(key, indexInTo.get(key)!, merged);
      continue;
    }
    if (!inTo) entries.remove(key);
    else if (inCurrent && !reordered) entries.set(key, towards(current[key], from[key], to[key], depth - 1));
    else if (inCurrent) entries.insert(key, indexInTo.get(key)!, towards(current[key], from[key], to[key], depth - 1));
    else if (!onlyMoved(from, to, key)) entries.insert(key, indexInTo.get(key)!, to[key]);
  }
  return entries.toRecord(current);
}

/** The step kept this key's value and only moved it. */
function onlyMoved(from: Entries, to: Entries, key: string): boolean {
  return isKey(from, key) && from[key] === to[key];
}

/** The tracked state moved towards `to` by what changed between `from` and `to`, branch by branch. */
export function restore(current: HistorySnapshot, from: HistorySnapshot, to: HistorySnapshot): HistorySnapshot {
  const result: HistorySnapshot = { ...current };
  for (const branch of TRACKED_BRANCHES) {
    result[branch] = towards(current[branch], from[branch], to[branch], BRANCH_DEPTH[branch]);
  }
  return result;
}
