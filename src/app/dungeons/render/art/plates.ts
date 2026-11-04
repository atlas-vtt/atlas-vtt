import { hash2 } from './noise';

/**
 * Broken rock as plates: a jittered lattice of points wrapping every `n` units, each point a plate
 * (a Voronoi cell). The same plates are a texture's (`stone/textures.ts`) and the mask that lets
 * the rock break off plate by plate at its edge, so the edge follows the cracks.
 */
export interface Plate {
  /** The plate's lattice cell, not wrapped: unique over the map. */
  i: number;
  j: number;
  /** Its point, in the lattice's units. */
  x: number;
  y: number;
}

export interface PlateHit {
  nearest: Plate;
  /** The plate beside it, across the nearest crack. */
  next: Plate;
  /** Distances to the two: a small `f2 - f1` lies on a crack. */
  f1: number;
  f2: number;
}

/** The point of lattice cell (i, j) of a lattice wrapping every `n`. */
export function platePoint(i: number, j: number, n: number, seed: number): Plate {
  const wi = ((i % n) + n) % n;
  const wj = ((j % n) + n) % n;
  return { i, j, x: i + 0.15 + hash2(wi, wj, seed) * 0.7, y: j + 0.15 + hash2(wi, wj, seed + 1) * 0.7 };
}

/** A plate's own value in [0, 1), the same for every repeat of the tile. */
export function plateValue(plate: Plate, n: number, seed: number): number {
  return hash2(((plate.i % n) + n) % n, ((plate.j % n) + n) % n, seed + 2);
}

export function plateAt(u: number, v: number, n: number, seed: number): PlateHit {
  const ci = Math.floor(u);
  const cj = Math.floor(v);
  let f1 = Infinity;
  let f2 = Infinity;
  let nearest: Plate | null = null;
  let next: Plate | null = null;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const p = platePoint(ci + di, cj + dj, n, seed);
      const d = Math.hypot(p.x - u, p.y - v);
      if (d < f1) {
        f2 = f1;
        next = nearest;
        f1 = d;
        nearest = p;
      } else if (d < f2) {
        f2 = d;
        next = p;
      }
    }
  }
  return { nearest: nearest!, next: next ?? nearest!, f1, f2 };
}
