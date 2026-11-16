/** Gradient noise of our own: a seeded permutation, eight gradients, quintic fade, octaves summed. */

import { type Rng, shuffled } from '../rng';

export type Noise2 = (x: number, y: number) => number;

const GRADIENTS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** One octave of gradient noise, about −0.7..0.7. */
function gradientNoise(rng: Rng): Noise2 {
  const base = shuffled(
    rng,
    Array.from({ length: 256 }, (_, i) => i),
  );
  const perm = [...base, ...base];
  const corner = (ix: number, iy: number, dx: number, dy: number): number => {
    const hash = perm[(perm[ix & 255] ?? 0) + (iy & 255)] ?? 0;
    const g = GRADIENTS[hash & 7] ?? [1, 0];
    return g[0] * dx + g[1] * dy;
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fade(fx);
    const v = fade(fy);
    const top = lerp(corner(ix, iy, fx, fy), corner(ix + 1, iy, fx - 1, fy), u);
    const bottom = lerp(corner(ix, iy + 1, fx, fy - 1), corner(ix + 1, iy + 1, fx - 1, fy - 1), u);
    return lerp(top, bottom, v);
  };
}

/** Octaves of noise, each twice as fine and `persistence` as strong as the one before. */
export function fractalNoise(rng: Rng, octaves: number, persistence: number, period: number): Noise2 {
  const layers = Array.from({ length: Math.max(1, octaves) }, () => gradientNoise(rng));
  const offsets = layers.map(() => [rng() * 256, rng() * 256] as const);
  return (x, y) => {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1 / period;
    layers.forEach((layer, k) => {
      const [ox, oy] = offsets[k] ?? [0, 0];
      sum += amplitude * layer(x * frequency + ox, y * frequency + oy);
      amplitude *= persistence;
      frequency *= 2;
    });
    return sum;
  };
}
