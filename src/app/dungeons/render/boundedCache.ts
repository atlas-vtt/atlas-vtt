/**
 * The value `make` gives for `key`, kept in `cache` with the `limit` most recently used: the
 * worker draws dungeon after dungeon for as long as the plugin runs, so nothing it caches per
 * seed or per look may grow without end.
 */
export function boundedCached<K, V>(cache: Map<K, V>, key: K, limit: number, make: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = make();
  cache.set(key, value);
  for (const oldest of cache.keys()) {
    if (cache.size <= limit) break;
    cache.delete(oldest);
  }
  return value;
}
