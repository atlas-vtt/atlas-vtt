/** What was read of the counted lists and maps since the last `resetCounts`. */
export const counts = { reads: 0, listings: 0 };

export function resetCounts(): void {
  counts.reads = 0;
  counts.listings = 0;
}

/**
 * A list or map that counts each item or field read of it, and each listing of its keys. It gives
 * up where a walk has plainly run away, so a test of an unbounded walk fails instead of hanging.
 */
export function counted<T extends object>(value: T): T {
  return new Proxy(value, {
    get(target, key, receiver): unknown {
      if (typeof key === 'string' && key !== 'length' && ++counts.reads > 1_000_000) throw new Error('The walk did not stop.');
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target): Array<string | symbol> {
      counts.listings += 1;
      return Reflect.ownKeys(target);
    },
  });
}

/** Levels of lists, each list holding the `width` lists below it: `width` to the power of `levels` ways down. */
export function sharedLists(width: number, levels: number): unknown[] {
  let level: unknown[] = Array.from({ length: width }, () => counted(Array<unknown>(width).fill('x')));
  for (let depth = 1; depth < levels; depth++) {
    const below = level;
    level = Array.from({ length: width }, () => counted([...below]));
  }
  return level;
}

/** A list that holds itself `times` over. */
export function selfHoldingList(times: number): unknown[] {
  const loop: unknown[] = ['in'];
  for (let item = 0; item < times; item++) loop.push(loop);
  return counted(loop);
}

/** Lists inside each other, `levels` deep. */
export function nestedLists(levels: number): unknown {
  let deep: unknown = 'the bottom';
  for (let depth = 0; depth < levels; depth++) deep = counted([deep]);
  return deep;
}

/**
 * The shapes a value can take to make an unbounded walk cost far more than its size, or never
 * end: what a YAML alias, a deep nesting or sheer length gives.
 */
export const HOSTILE_VALUES: Record<string, () => unknown> = {
  'lists that hold each other at nine levels': () => counted(sharedLists(10, 9)),
  'one list held a thousand times': () => {
    const shared = counted(Array<string>(1000).fill('word'));
    return counted(Array<unknown>(1000).fill(shared));
  },
  'a list that holds itself many times': () => selfHoldingList(1000),
  'a map that holds itself': () => {
    const map: Record<string, unknown> = { name: 'Loop' };
    map.self = map;
    map.again = [map, map];
    return counted(map);
  },
  'ten thousand levels of lists': () => nestedLists(10_000),
  'a million short entries': () => counted(Array<string>(1_000_000).fill('x')),
  'a hundred thousand numbers under as many keys': () =>
    counted(Object.fromEntries(Array.from({ length: 100_000 }, (_, key) => [`field ${key}`, key]))),
  'many entries sharing one wide map': () => {
    const wide = counted(Object.fromEntries(Array.from({ length: 5000 }, (_, key) => [`key ${key}`, key])));
    return counted(Array.from({ length: 5000 }, () => counted(['Shared', wide, wide])));
  },
  'texts far longer than a statblock': () =>
    counted(Array.from({ length: 500 }, () => ({ name: 'Long', desc: 'word '.repeat(20_000) }))),
};
