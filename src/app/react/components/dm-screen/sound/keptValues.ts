import { useState } from 'react';

/**
 * `next` with each value of `before` kept where `same` finds the two equal: a list worked out anew for every tile
 * on every change of the library keeps its objects, so the tiles memoised on them render nothing.
 */
export function keptValues<K, V>(before: ReadonlyMap<K, V>, next: ReadonlyMap<K, V>, same: (a: V, b: V) => boolean): ReadonlyMap<K, V> {
  const kept = new Map<K, V>();
  for (const [key, value] of next) {
    const was = before.get(key);
    kept.set(key, was !== undefined && same(was, value) ? was : value);
  }
  return kept;
}

/** `keptValues` against what the last render returned (React's pattern for information from earlier renders). */
export function useKeptValues<K, V>(next: ReadonlyMap<K, V>, same: (a: V, b: V) => boolean): ReadonlyMap<K, V> {
  const [held, setHeld] = useState({ next, kept: next });
  if (held.next === next) return held.kept;
  const kept = keptValues(held.kept, next, same);
  setHeld({ next, kept });
  return kept;
}
