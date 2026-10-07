function freezeDeep(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const inner of Object.values(value)) freezeDeep(inner);
}

/** `value`, built fresh for an extension, frozen in place to its depth. Never for an object Atlas keeps using. */
export function deepFrozen<T>(value: T): T {
  freezeDeep(value);
  return value;
}

/** Frozen copies of store values that were not frozen, by the value: the same value always gives the same copy. */
const storeCopies = new WeakMap<object, unknown>();

/**
 * Store data handed out by reference when Immer has frozen it, else as a frozen copy: a value a plain `set` wrote
 * (a store rehydrated from its file, a fresh view) is not frozen until the next draft update. The copy is made once per
 * value, so snapshots keep handing out the same object while the store keeps the same value.
 */
export function frozenStoreValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  const kept = storeCopies.get(value);
  if (kept !== undefined) return kept as T;
  const copy = frozenCopy(value);
  storeCopies.set(value, copy);
  return copy;
}

/**
 * What the API hands out when the value is not already immutable store data: a deep copy, deeply frozen,
 * so an extension can never change Atlas's own state through it.
 */
export function frozenCopy<T>(value: T): T {
  const copy = structuredClone(value);
  freezeDeep(copy);
  return copy;
}
