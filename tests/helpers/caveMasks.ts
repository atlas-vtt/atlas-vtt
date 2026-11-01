import { cellKey } from '../../src/app/dungeons/geometry';
import type { Rng } from '../../src/app/dungeons/rng';
import type { Vec } from '../../src/app/dungeons/render/geometry';
import { chaikin } from '../../src/app/dungeons/water/smooth';

/**
 * Cave shapes shared by the outline and field tests and the perf project, which times the same
 * shapes the tests hold correct.
 */

/** A cave's cells, as keys of `cellKey`. */
export type CaveMask = Set<string>;

/** A blob grown cell by cell from the middle of a `size` × `size` box, over 20 to 50 % of it, never on its border. */
export function blob(rng: Rng, size: number): CaveMask {
  const mask: CaveMask = new Set([cellKey(size >> 1, size >> 1)]);
  const target = Math.floor(size * size * (0.2 + rng() * 0.3));
  while (mask.size < target) {
    const cells = [...mask];
    const [x, y] = cells[Math.floor(rng() * cells.length)]!.split(',').map(Number) as [number, number];
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)]!;
    const nx = x + dx!;
    const ny = y + dy!;
    if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1) mask.add(cellKey(nx, ny));
  }
  return mask;
}

/** Thirty blobs of 16 cells scattered over a 120 × 120 cave: the size of the largest floors. */
export function scatteredCave(rng: Rng): CaveMask {
  const mask: CaveMask = new Set();
  for (let k = 0; k < 30; k++) {
    const ox = Math.floor(rng() * 104);
    const oy = Math.floor(rng() * 104);
    for (const key of blob(rng, 16)) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      mask.add(cellKey(x + ox, y + oy));
    }
  }
  return mask;
}

/** A wobbly ring of radius 8 to 12 round (15, 15), smoothed to 400 vertices as a cave's outline is. */
export function wobblyRing(rng: Rng): Vec[] {
  const ring = Array.from({ length: 50 }, (_, k) => {
    const a = (k / 50) * Math.PI * 2;
    const r = 8 + rng() * 4;
    return { x: 15 + Math.cos(a) * r, y: 15 + Math.sin(a) * r };
  });
  return chaikin(ring, 3);
}
