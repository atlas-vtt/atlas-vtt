/**
 * Deterministic noise for the art directions: value noise at any point (for vector jitter and
 * per-sample tones) and seamless tiles (for textures drawn as patterns).
 */

import { boundedCached } from '../boundedCache';

/** An integer hash of a lattice point, in [0, 1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1], lattice spacing 1. */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

/** Octaves of value noise, normalised to about [0, 1]. */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f + o * 17.3, y * f - o * 9.1, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** A square field that wraps: `size` × `size` values. */
export interface Tile {
  size: number;
  values: Float32Array;
}

/** Value noise on a wrapping lattice of `cells` × `cells`, sampled at `size` × `size`. */
function periodicLayer(size: number, cells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    const ty = smooth(gy - y0);
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      const tx = smooth(gx - x0);
      const a = hash2(x0 % cells, y0 % cells, seed);
      const b = hash2((x0 + 1) % cells, y0 % cells, seed);
      const c = hash2(x0 % cells, (y0 + 1) % cells, seed);
      const d = hash2((x0 + 1) % cells, (y0 + 1) % cells, seed);
      const top = a + (b - a) * tx;
      out[y * size + x] = top + (c + (d - c) * tx - top) * ty;
    }
  }
  return out;
}

/** Seamless fbm, from a lattice of `base` cells up, `octaves` deep; values about [0, 1]. */
export function periodicFbm(size: number, base: number, seed: number, octaves = 5, gain = 0.5): Tile {
  const values = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves && base * 2 ** o <= size / 2; o++) {
    const layer = periodicLayer(size, base * 2 ** o, seed + o * 7919);
    for (let i = 0; i < values.length; i++) values[i]! += layer[i]! * amp;
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < values.length; i++) values[i]! /= norm;
  return { size, values };
}

/** Bilinear lookup in a tile, wrapping. */
export function sampleTile(tile: Tile, x: number, y: number): number {
  const { size, values } = tile;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number): number => values[(((yy % size) + size) % size) * size + (((xx % size) + size) % size)]!;
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  return top + (at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx - top) * fy;
}

/** Rescales values to mean 0, standard deviation 1. */
export function standardised(values: Float32Array): Float32Array {
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  const sd = Math.sqrt(variance / values.length) || 1;
  return values.map(v => (v - mean) / sd);
}

const samplers = new Map<string, Tile>();
/** Tiles kept: several per dungeon (rock edge, shade, weathering, water), for the last few dungeons. */
const SAMPLER_LIMIT = 16;

/**
 * Seamless fbm as a function of a cell-space point, one tile `cells` wide: fast enough for every
 * sample of a soft field.
 */
export function noiseSampler(seed: number, cells: number, base = 4, octaves = 4, size = 256): (x: number, y: number) => number {
  const t = boundedCached(samplers, `${seed}:${base}:${octaves}:${size}`, SAMPLER_LIMIT, () => periodicFbm(size, base, seed, octaves));
  const k = size / cells;
  return (x, y) => sampleTile(t, x * k, y * k);
}
