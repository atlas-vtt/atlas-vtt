import { DEFAULT_PX_PER_CELL } from '../layoutSize';
import { periodicFbm, standardised } from '../art/noise';
import { smoothstep } from '../art/paths';
import { plateAt, plateValue, type Plate } from '../art/plates';

/**
 * Seamless surfaces of Stone & shadow, made once per colour: heightfields lit from the top left,
 * so a texture carries the same light as the shadows on the map.
 */

/** Rock tiles: their side in texels, the cells they cover, and their plates across. */
export const ROCK_TILE = { px: 1024, cells: 3, plates: 7, seed: 0x51a7e };

const LIGHT = (() => {
  const l = [-0.5, -0.5, 0.71];
  const n = Math.hypot(...l);
  return l.map(v => v / n) as [number, number, number];
})();

const cache = new Map<string, OffscreenCanvas>();

/** Texels for a tile repeated every `cells` cells: one a pixel of a scene's map, up to 2048. */
export function tileTexels(cells: number): number {
  return Math.min(2048, 2 ** Math.ceil(Math.log2(cells * DEFAULT_PX_PER_CELL)));
}

function canvasOf(size: number, rgba: Uint8ClampedArray<ArrayBuffer>): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size, size);
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, size), 0, 0);
  return canvas;
}

/** Facets across the tile, inside the plates: each a flat face of its own tilt. */
const FACETS = 17;
/** Half the width of a crack between plates, and the lit or shaded lip beside it, in texels. */
const CRACK_TEXELS = 2.2;
const CRACK_LIP_TEXELS = 2.4;
/** The most a facet darkens or lightens its rock: a few steps, never so far that a whole facet takes another colour. */
const FACET_SHADE = 0.2;
const FACET_LIGHT = 0.16;

/** The tilt of a plate or facet as the slope of its face along x and y. */
function tiltOf(a: number, b: number, steep: number): [number, number] {
  const angle = a * Math.PI * 2;
  const slope = steep * (0.25 + b * 0.75);
  return [Math.cos(angle) * slope, Math.sin(angle) * slope];
}

/** How much a face of slopes (`dx`, `dy`) is lit beyond a level one. */
function faceLight(dx: number, dy: number): number {
  return (-dx * LIGHT[0] - dy * LIGHT[1] + LIGHT[2]) / Math.hypot(dx, dy, 1) - LIGHT[2];
}

/**
 * Natural rock as a painter blocks it in: plates split by crisp cracks, each plate broken into
 * flat facets, every facet one tone by how it faces the light at the top left, a crack's lip lit
 * where it faces the light and shaded where it faces away. No noise: every change of tone is an
 * edge, so the rock stays crisp at any zoom. Drawn as deviations (white lightens, black darkens),
 * so one tile serves every colour.
 */
export function rockTile(): OffscreenCanvas {
  const key = 'rock';
  const known = cache.get(key);
  if (known) return known;
  const { px: size, plates, seed } = ROCK_TILE;
  // A slow, small warp, so cracks bend a little without losing their edge.
  const bendX = periodicFbm(size, 3, seed + 1, 2, 0.5).values;
  const bendY = periodicFbm(size, 3, seed + 2, 2, 0.5).values;
  const plateTexels = size / plates;
  const facetTexels = size / FACETS;
  const facetTone = (plate: Plate, facet: Plate): number => {
    const [px, py] = tiltOf(plateValue(plate, plates, seed), plateValue(plate, plates, seed + 7), 0.55);
    const [fx, fy] = tiltOf(plateValue(facet, FACETS, seed + 11), plateValue(facet, FACETS, seed + 13), 0.4);
    return Math.max(-FACET_SHADE, Math.min(FACET_LIGHT, faceLight(px + fx, py + fy) * 0.7));
  };
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const wx = (bendX[k]! - 0.5) * 0.35;
      const wy = (bendY[k]! - 0.5) * 0.35;
      const plate = plateAt((x / size) * plates + wx, (y / size) * plates + wy, plates, seed);
      const facet = plateAt((x / size) * FACETS + wx * 1.8, (y / size) * FACETS + wy * 1.8, FACETS, seed + 9);
      // A facet's edge is one texel of blend between its two tones, no more.
      const seam = Math.min(1, ((facet.f2 - facet.f1) / 2) * facetTexels);
      let d = facetTone(plate.nearest, facet.nearest) * (0.5 + seam * 0.5) + facetTone(plate.nearest, facet.next) * (0.5 - seam * 0.5);
      // Across a crack: dark in it, and on its lip lit or shaded by which way the plate's edge faces.
      const fromCrack = ((plate.f2 - plate.f1) / 2) * plateTexels;
      const ex = plate.next.x - plate.nearest.x;
      const ey = plate.next.y - plate.nearest.y;
      const faces = (ex * LIGHT[0] + ey * LIGHT[1]) / (Math.hypot(ex, ey) || 1);
      const lip = 1 - smoothstep(CRACK_TEXELS, CRACK_TEXELS + CRACK_LIP_TEXELS, fromCrack);
      d += lip * (faces > 0 ? 0.16 : -0.1) * Math.min(1, Math.abs(faces) * 2);
      const crack = 1 - smoothstep(CRACK_TEXELS - 0.8, CRACK_TEXELS + 0.6, fromCrack);
      d = d * (1 - crack) - 0.42 * crack;
      const v = d > 0 ? 255 : 0;
      out[k * 4] = v;
      out[k * 4 + 1] = v;
      out[k * 4 + 2] = v;
      out[k * 4 + 3] = Math.min(255, Math.abs(d) * 255);
    }
  }
  const canvas = canvasOf(size, out);
  cache.set(key, canvas);
  return canvas;
}

/**
 * The grain of dressed stone as deviations from the surface: a soft mottle, a fine even speckle
 * and here and there a pore, black and white texels whose alpha moves the brightness by a few
 * percent, so it lies over any colour. No direction in it: stone is worn, not scratched.
 */
export function grainTile(strength: number, size = 256): OffscreenCanvas {
  const key = `grain:${strength}:${size}`;
  const known = cache.get(key);
  if (known) return known;
  const mottle = standardised(periodicFbm(size, 3, 0x9a1, 4, 0.55).values);
  const speckle = standardised(periodicFbm(size, 64, 0x9a2, 2, 0.5).values);
  const pores = periodicFbm(size, 32, 0x9a3, 2, 0.5).values;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < mottle.length; i++) {
    const pore = pores[i]! > 0.78 ? -(pores[i]! - 0.78) * 9 : 0;
    const d = (mottle[i]! * 0.55 + speckle[i]! * 0.45 + pore) * strength;
    const v = d > 0 ? 255 : 0;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = Math.min(255, Math.abs(d) * 255);
  }
  const canvas = canvasOf(size, out);
  cache.set(key, canvas);
  return canvas;
}

/**
 * The grain of wood: long fibres along x with a knot here and there, as deviations like the
 * stone's grain, so planks keep their own colour.
 */
export function woodTile(strength: number, size = 256): OffscreenCanvas {
  const key = `wood:${strength}:${size}`;
  const known = cache.get(key);
  if (known) return known;
  const along = periodicFbm(size, 4, 0x3d1, 4).values;
  const fibre = periodicFbm(size, 64, 0x3d2, 2).values;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const ring = Math.sin((y / size) * Math.PI * 2 * 9 + along[k]! * 9) * 0.5 + 0.5;
      const d = ((ring - 0.5) * 0.7 + (fibre[((y * 7) % size) * size + x]! - 0.5) * 0.6) * strength;
      const v = d > 0 ? 255 : 0;
      out[k * 4] = v;
      out[k * 4 + 1] = v;
      out[k * 4 + 2] = v;
      out[k * 4 + 3] = Math.min(255, Math.abs(d) * 255);
    }
  }
  const canvas = canvasOf(size, out);
  cache.set(key, canvas);
  return canvas;
}
