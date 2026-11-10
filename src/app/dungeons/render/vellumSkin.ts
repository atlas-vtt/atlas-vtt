/**
 * The grain of the vellum the dungeon is drawn on: milky clouds, soft wandering streaks and a faint
 * pore grain, as on the Cairn tokens' backdrop. Each is a tile that repeats seamlessly (its noise
 * wraps), as a deviation from the surface's colour: positive lightens, negative darkens.
 */

import { rngFrom, type Rng } from '../rng';

/** One square field of values, `size` × `size`, row by row. */
interface Field {
  size: number;
  values: Float32Array;
}

/** Value noise on a lattice of `cells` that wraps at the tile's edge, smoothly interpolated. */
function periodicNoise(rng: Rng, size: number, cells: number): Field {
  const lattice = Float32Array.from({ length: cells * cells }, () => rng());
  const values = new Float32Array(size * size);
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    const ty = smooth(gy - y0);
    const r0 = (y0 % cells) * cells;
    const r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      const tx = smooth(gx - x0);
      const c0 = x0 % cells;
      const c1 = (x0 + 1) % cells;
      const top = lattice[r0 + c0]! + (lattice[r0 + c1]! - lattice[r0 + c0]!) * tx;
      const bottom = lattice[r1 + c0]! + (lattice[r1 + c1]! - lattice[r1 + c0]!) * tx;
      values[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return { size, values };
}

/** Octaves of periodic noise, from `base` lattice cells up, halving in weight. */
function fbm(rng: Rng, size: number, base: number, octaves = 5): Field {
  const values = new Float32Array(size * size);
  let amplitude = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves && base * 2 ** octave <= size / 2; octave++) {
    const layer = periodicNoise(rng, size, base * 2 ** octave).values;
    for (let i = 0; i < values.length; i++) values[i]! += layer[i]! * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < values.length; i++) values[i]! /= norm;
  return { size, values };
}

/** Bilinear lookup that wraps, so a field read through a warp still tiles. */
function sample(field: Field, x: number, y: number): number {
  const { size, values } = field;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number): number => values[(((yy % size) + size) % size) * size + (((xx % size) + size) % size)]!;
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Mean 0, standard deviation 1. */
function normalised(values: Float32Array): Float32Array {
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  const sd = Math.sqrt(variance / values.length) || 1;
  return values.map(v => (v - mean) / sd);
}

/**
 * The large tile: clouds through a domain warp, less a little where soft streaks wander. Its
 * deviations are fractions of the surface's brightness (the token backdrop's 3.6 % and 2.4 %).
 */
export function cloudTile(size: number, seed: number): Float32Array {
  const rng = rngFrom(seed);
  const qx = fbm(rng, size, 3);
  const qy = fbm(rng, size, 3);
  const clouds = fbm(rng, size, 3);
  const ridges = fbm(rng, size, 2);
  const warped = new Float32Array(size * size);
  const streak = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = qx.values[i]! - 0.5;
      const dy = qy.values[i]! - 0.5;
      warped[i] = sample(clouds, x + dx * size * 0.22, y + dy * size * 0.22);
      const ridge = sample(ridges, x + dy * size * 0.35, y + dx * size * 0.35);
      streak[i] = Math.max(0, 1 - Math.abs(ridge * 2 - 1)) ** 7;
    }
  }
  const c = normalised(warped);
  const s = normalised(streak);
  return c.map((v, i) => v * 0.036 - Math.max(0, s[i]!) * 0.024);
}

/** A 3 × 3 box blur that wraps at the tile's edge. */
function softened(values: Float32Array, size: number): Float32Array {
  return values.map((_, i) => {
    const x = i % size;
    const y = (i - x) / size;
    let sum = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += values[((y + oy + size) % size) * size + ((x + ox + size) % size)]!;
    return sum / 9;
  });
}

/** The small tile: the pores, a softened random grain (the backdrop's 1 %), one texel a map pixel. */
export function poreTile(size: number, seed: number): Float32Array {
  const rng = rngFrom(seed);
  const raw = Float32Array.from({ length: size * size }, () => rng());
  return normalised(softened(raw, size)).map(v => v * 0.01);
}

/**
 * A tile's deviations as pixels: white where it lightens, black where it darkens. Over a surface
 * of brightness `surface` (0..1) a deviation `d` moves the brightness by `d` × `strength`: white
 * at `d · strength / (1 − surface)` opaque, black at `d · strength / surface`.
 */
export function deviationPixels(deviation: Float32Array, surface: number, strength: number): Uint8ClampedArray<ArrayBuffer> {
  const lighten = strength / Math.max(0.02, 1 - surface);
  const darken = strength / Math.max(0.02, surface);
  const pixels = new Uint8ClampedArray(deviation.length * 4);
  deviation.forEach((d, i) => {
    const value = d > 0 ? 255 : 0;
    pixels[i * 4] = value;
    pixels[i * 4 + 1] = value;
    pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = Math.abs(d) * (d > 0 ? lighten : darken) * 255;
  });
  return pixels;
}
