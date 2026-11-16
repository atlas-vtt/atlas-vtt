import type { TexelMask } from '../../src/app/levels/stackClip';
import { distToSeg } from '../../src/app/lighting/segments';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { LevelSurface } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { insidePolygon, type FuzzRoom, type P } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { paintedTexture } from './levelsView';

/** Pieces of the levels' leak fuzz (`leakFuzzLevels.gpu.test.ts`): scenes, hues and checks. */

/** Any trace of the level below's hue: its floor in dim light at night is dark (red and blue some 45 over green). */
export const magenta = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! > pixels[o + 1]! + 16 && pixels[o + 2]! > pixels[o + 1]! + 16;
export const cyan = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o + 1]! > pixels[o]! + 50 && pixels[o + 2]! > pixels[o]! + 50;
export const lit = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! + pixels[o + 1]! + pixels[o + 2]! > 3;

/** Magenta noise, the level below's own hue. */
export function belowArt(map: number): ReturnType<typeof paintedTexture> {
  const side = Math.min(map, 2048);
  return paintedTexture(side, side, (x, y) => {
    const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const v = 150 + (n % 90);
    return [v, 20 + (n % 15), v];
  });
}

export function surface(id: string, polygon: readonly P[], open: boolean, level = 'upper'): LevelSurface {
  return { id, kind: 'level-surface', level, open, polygon: polygon.map(([x, y]) => ({ x, y })) };
}

export function wallsOn(room: FuzzRoom, prefix: string, level: string): Record<string, WallSegment> {
  return Object.fromEntries(room.walls.map((wall) => [`${prefix}${wall.id}`, { ...wall, id: `${prefix}${wall.id}`, levels: [level] }]));
}

export function light(id: string, [x, y]: P, level: string, dim: number, extra: Partial<LightSource['emission']> = {}, rotation?: number): LightSource {
  return { id, kind: 'light', x, y, levels: [level], ...(rotation !== undefined && { rotation }), emission: { bright: dim / 2, dim, color: '#ffffff', intensity: 1, animation: 'none', ...extra } };
}

export function token(id: string, [x, y]: P, level: string, extra: Partial<TokenEntity> = {}): TokenEntity {
  return { id, kind: 'token', x, y, imagePath: 'art.png', size: 1, level, ...extra } as TokenEntity;
}

/** A point inside `polygon` near its middle, or null. */
export function inside(polygon: readonly P[], rand: () => number): P | null {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  for (let attempt = 0; attempt < 40; attempt++) {
    const p: P = [Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys))];
    if (insidePolygon(p, polygon)) return p;
  }
  return null;
}

/** Whether the segment from `a` to `b` crosses the wall. */
export function crosses(a: P, b: P, wall: WallSegment): boolean {
  const side = (p: P, q: { x: number; y: number }, r: { x: number; y: number }): number => (r.x - q.x) * (p[1] - q.y) - (r.y - q.y) * (p[0] - q.x);
  const [d1, d2] = [side(a, wall.p1, wall.p2), side(b, wall.p1, wall.p2)];
  const cross = (q: { x: number; y: number }): number => (b[0] - a[0]) * (q.y - a[1]) - (b[1] - a[1]) * (q.x - a[0]);
  return d1 * d2 <= 0 && cross(wall.p1) * cross(wall.p2) <= 0;
}

/** A point of the opening the upper room's `from` has a clear line to, or null. */
export function inPlainView(from: P, opening: readonly P[], walls: readonly WallSegment[], rand: () => number): P | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const p = inside(opening, rand);
    if (p && walls.every((wall) => !crosses(from, p, wall))) return p;
  }
  return null;
}

/** Distance from `p` to the nearest edge of any of the polygons. */
export function toEdges(p: { x: number; y: number }, polygons: readonly (readonly { x: number; y: number }[])[]): number {
  let best = Infinity;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      best = Math.min(best, distToSeg(p.x, p.y, [a.x, a.y, b.x, b.y]));
    }
  }
  return best;
}

/** Whether a memory texel of `clip` lies within `reach` texels of (`mx`, `my`). */
export function nearAllowed(clip: TexelMask | null, mx: number, my: number, reach: number): boolean {
  if (!clip) return false;
  for (let y = Math.floor(my - reach); y <= Math.ceil(my + reach); y++) {
    for (let x = Math.floor(mx - reach); x <= Math.ceil(mx + reach); x++) {
      const [cx, cy] = [x - clip.x, y - clip.y];
      if (cx >= 0 && cy >= 0 && cx < clip.columns && cy < clip.rows && clip.allowed[cy * clip.columns + cx]) return true;
    }
  }
  return false;
}

/** The alpha of every texel of a saved memory mask. */
export async function maskAlpha(dataUrl: string): Promise<{ width: number; height: number; alpha: Uint8ClampedArray }> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  return { width: canvas.width, height: canvas.height, alpha };
}

