import { fnv1a32 } from '../utils/hashing';

/** A seeded source of numbers in [0, 1). */
export type Rng = () => number;

/**
 * The concerns that draw numbers. Each has a stream of its own, so restyling never changes the
 * layout, and a change in one never shifts the others.
 */
export type RngStream = 'layout' | 'stairs' | 'terrain' | 'furnish' | 'props' | 'water' | 'growth' | 'rooms' | 'cave' | 'render' | 'lights';

/** Largest seed a GM can type (1 to 2³¹ − 2). */
export const MAX_SEED = 2_147_483_646;

/** mulberry32: small, fast, full 32-bit period, good enough for maps. */
export function rngFrom(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The stream of one concern of one dungeon; `key` splits it further (a room's own subtree). */
export function stream(seed: number, name: RngStream, key: string | number = ''): Rng {
  return rngFrom(fnv1a32(`${seed}#${name}#${key}`));
}

/** The streams of one concern on one floor, by key. */
export type KeyedRng = (key: string | number) => Rng;

/** The stream of one concern on one floor of a dungeon. */
export function floorStream(seed: number, name: RngStream, floor: number, key: string | number = ''): Rng {
  return stream(seed, name, `${floor}:${key}`);
}

/** A new seed for New dungeon. */
export function randomSeed(random: Rng = Math.random): number {
  return 1 + Math.floor(random() * MAX_SEED);
}

export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

/** Picks by weight; weights need not sum to 1. */
export function weighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  let last: T | undefined;
  for (const [item, w] of items) {
    last = item;
    r -= w;
    if (r < 0) return item;
  }
  if (last === undefined) throw new Error('weighted pick from an empty list');
  return last;
}

/** About normally distributed in [0, 1): the mean of three draws. */
export function normalish(rng: Rng): number {
  return (rng() + rng() + rng()) / 3;
}

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
