import type { PileStone } from './hand';

/** How much farther than its reach a stone's outline may stray (`stoneOutline` stretches it by up to a fifth). */
export const STRAY = 1.25;

/**
 * A pile's stones in layers, back to front: a stone lies one layer above the highest earlier stone
 * it overlaps, so no two stones of a layer overlap and each layer can be drawn as one.
 */
export function pileLayers<T extends PileStone>(stones: readonly T[]): T[][] {
  if (!stones.length) return [];
  const size = Math.max(...stones.map(s => s.r)) * STRAY * 2;
  const buckets = new Map<string, { stone: T; layer: number }[]>();
  const layers: T[][] = [];
  for (const stone of stones) {
    const bx = Math.floor(stone.c.x / size);
    const by = Math.floor(stone.c.y / size);
    let layer = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          const reach = (other.stone.r + stone.r) * STRAY;
          if (Math.hypot(other.stone.c.x - stone.c.x, other.stone.c.y - stone.c.y) < reach) layer = Math.max(layer, other.layer + 1);
        }
      }
    }
    const key = `${bx},${by}`;
    buckets.set(key, [...(buckets.get(key) ?? []), { stone, layer }]);
    (layers[layer] ??= []).push(stone);
  }
  return layers;
}
