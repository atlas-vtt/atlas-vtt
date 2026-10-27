import { CanvasSource, Texture } from 'pixi.js';
import { OPEN_ALPHA_BYTE, type ArtAlpha } from '../../src/app/levels/artRaster';
import { createTileGraphics, browserGraphicsPrimitives } from '../../src/app/pixi/mapImage/tileGraphics';
import type { P } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';

/**
 * Maps with transparent parts for the levels' leak fuzz over art (`levelsArtFuzz.ts`): noise of one
 * hue per level, with round holes whose edges fade over a few pixels (anti-aliased) and, around
 * some, a faint shadow (alpha a quarter) that is floor. Each map comes with its true alpha, for the
 * checks, and the alpha the tile worker would read (`ArtAlpha`): the image itself up to 2,048 px, its
 * overview resized as the worker resizes it above.
 */

export type Hue = 'grey' | 'magenta' | 'yellow';

/** A transparent hole in image pixels; `shadow` adds a faint ring of floor around it. */
export interface Hole {
  x: number;
  y: number;
  r: number;
  shadow: boolean;
}

export interface ArtMap {
  texture: Texture;
  width: number;
  height: number;
  /** The true alpha of every pixel, row by row. */
  trueAlpha: Uint8ClampedArray;
  /** What the tile worker reads of it (`FakeMap.alpha`). */
  alpha: ArtAlpha;
}

/** How far an edge fades, in image pixels. */
const RAMP = 3;
/** A shadow's alpha and width. */
const SHADOW_ALPHA = 64;
const SHADOW_WIDTH = 14;
/** The overview the worker reads: the image fit within this. */
const OVERVIEW = 2048;

function colour(hue: Hue, x: number, y: number): [number, number, number] {
  const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const v = 150 + (n % 90);
  if (hue === 'magenta') return [v, 20 + (n % 15), v];
  if (hue === 'yellow') return [v, Math.round(v * 0.85), 20 + (n % 15)];
  const g = 110 + (n % 60);
  return [g, g, g];
}

/** The alpha of a pixel whose centre lies `d` image pixels from a hole's centre. */
function alphaAt(d: number, hole: Hole): number {
  const out = d - hole.r;
  if (out <= 0) return 0;
  if (!hole.shadow) return Math.min(255, Math.round((out / RAMP) * 255));
  if (out < RAMP) return Math.round((out / RAMP) * SHADOW_ALPHA);
  if (out < RAMP + SHADOW_WIDTH) return SHADOW_ALPHA;
  return Math.min(255, Math.round(SHADOW_ALPHA + ((out - RAMP - SHADOW_WIDTH) / RAMP) * (255 - SHADOW_ALPHA)));
}

/** A map of `width` × `height` pixels in `hue`, opaque but for `holes`. */
export async function artMap(width: number, height: number, hue: Hue, holes: readonly Hole[]): Promise<ArtMap> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 255;
      for (const hole of holes) {
        const dx = x + 0.5 - hole.x;
        const dy = y + 0.5 - hole.y;
        // Most pixels lie far from every hole.
        if (Math.abs(dx) > hole.r + 40 || Math.abs(dy) > hole.r + 40) continue;
        a = Math.min(a, alphaAt(Math.hypot(dx, dy), hole));
      }
      const [r, g, b] = colour(hue, x, y);
      const o = (y * width + x) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = a;
      alpha[y * width + x] = a;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new Texture({ source: new CanvasSource({ resource: canvas }) });
  return { texture, width, height, trueAlpha: alpha, alpha: await workerRead(canvas, alpha, width, height) };
}

/** What the tile worker reads of a map: its own pixels up to `OVERVIEW` a side, else its overview resized as the worker does. */
async function workerRead(canvas: HTMLCanvasElement, alpha: Uint8ClampedArray, width: number, height: number): Promise<ArtAlpha> {
  if (Math.max(width, height) <= OVERVIEW) {
    return { width, height, opaque: Uint8Array.from(alpha, (a) => (a > OPEN_ALPHA_BYTE ? 1 : 0)) };
  }
  const graphics = createTileGraphics(browserGraphicsPrimitives());
  const scale = OVERVIEW / Math.max(width, height);
  const source = await createImageBitmap(canvas);
  const overview = await graphics.resize(source, Math.round(width * scale), Math.round(height * scale));
  source.close();
  try {
    return { width: overview.width, height: overview.height, opaque: graphics.opaquePixels(overview, OPEN_ALPHA_BYTE) };
  } finally {
    overview.close();
  }
}

/** Whether the map holds art (alpha above the threshold) within one pixel of image point (`x`, `y`). */
export function artNear(map: ArtMap, x: number, y: number): boolean {
  const [cx, cy] = [Math.floor(x), Math.floor(y)];
  for (let py = cy - 1; py <= cy + 1; py++) {
    for (let px = cx - 1; px <= cx + 1; px++) {
      if (px < 0 || py < 0 || px >= map.width || py >= map.height) continue;
      if (map.trueAlpha[py * map.width + px]! > OPEN_ALPHA_BYTE) return true;
    }
  }
  return false;
}

/** Round holes, some about `near` (image pixels: where a scout looks), the rest anywhere. */
export function holesAbout(near: readonly P[], width: number, height: number, rand: () => number): Hole[] {
  const holes: Hole[] = near.map(([x, y]) => ({ x: x + (rand() - 0.5) * 80, y: y + (rand() - 0.5) * 80, r: 30 + rand() * 120, shadow: rand() < 0.4 }));
  const more = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < more; i++) holes.push({ x: rand() * width, y: rand() * height, r: 20 + rand() * 150, shadow: rand() < 0.4 });
  return holes;
}

/** The hue a pixel shows of a level below: any trace of it, since a floor in dim light at night is dark. */
export function hueOf(pixels: Uint8ClampedArray, o: number): Hue | null {
  const [r, g, b] = [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!];
  if (r > g + 16 && b > g + 16) return 'magenta';
  if (r > b + 16 && g > b + 16) return 'yellow';
  return null;
}

/** Whether every pixel of the map within one pixel of image point (`x`, `y`) is fully opaque. */
export function solidNear(map: ArtMap, x: number, y: number): boolean {
  const [cx, cy] = [Math.floor(x), Math.floor(y)];
  for (let py = cy - 1; py <= cy + 1; py++) {
    for (let px = cx - 1; px <= cx + 1; px++) {
      if (px < 0 || py < 0 || px >= map.width || py >= map.height || map.trueAlpha[py * map.width + px]! < 255) return false;
    }
  }
  return true;
}
