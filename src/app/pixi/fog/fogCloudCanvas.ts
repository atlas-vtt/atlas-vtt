/**
 * Canvas 2D side of cloud reveal: the fog coverage baked as clouds once per change, the soft puff
 * that parts over a reveal, and the coarse fog masks a change is measured with.
 */
import { getDomHost } from '../../host/dom';
import type { FogBounds } from '../../types/fogTypes';
import type { QShape } from '../../types/shapeTypes';
import { drawFogCoverage } from './drawFogCoverage';
import type { FogMask } from './fogReveal';

/** Clouds are soft, so a quarter of world resolution is plenty and keeps the texture small. */
export const CLOUD_SCALE = 0.25;
/** Blur of the clouds' edge, in canvas pixels at `CLOUD_SCALE` (6 world pixels). */
const EDGE_BLUR_PX = 1.5;
/**
 * How far the clouds reach past the fog before they are blurred, in canvas pixels: two blur radii,
 * so that the fog's own edge lies under clouds of 98 % and the soft edge lies outside the fog. A
 * blur centred on the edge left half the map showing a cell deep into the fog.
 */
const EDGE_SPREAD_PX = 2 * EDGE_BLUR_PX;
const TILE_SIZE = 256;
const TILE_PUFFS = 140;
const PUFF_TEXTURE_SIZE = 128;

const cloudTiles = new Map<string, HTMLCanvasElement>();
const tintedPuffs = new Map<string, HTMLCanvasElement>();

function canvasOf(width: number, height: number): HTMLCanvasElement {
  return getDomHost().createCanvas(undefined, { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
}

/** `color` mixed towards white (`amount` > 0) or black (`amount` < 0), as 0xRRGGBB. */
function shade(color: string, amount: number): number {
  const value = parseInt(color.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const mix = (channel: number): number => Math.round(channel + (target - channel) * Math.abs(amount));
  return (mix(value >> 16) << 16) | (mix((value >> 8) & 0xff) << 8) | mix(value & 0xff);
}

const toCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** The lighter and darker tones clouds of `color` are drawn with; reveal puffs use the same. */
export function cloudTones(color: string): number[] {
  return [shade(color, 0.12), shade(color, 0.24), shade(color, -0.35)];
}

/** A radial gradient from opaque white to clear, tinted per use. */
export function createPuffCanvas(): HTMLCanvasElement {
  const canvas = canvasOf(PUFF_TEXTURE_SIZE, PUFF_TEXTURE_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const middle = PUFF_TEXTURE_SIZE / 2;
  const gradient = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PUFF_TEXTURE_SIZE, PUFF_TEXTURE_SIZE);
  return canvas;
}

function tintedPuff(puff: HTMLCanvasElement, tone: string): HTMLCanvasElement {
  const cached = tintedPuffs.get(tone);
  if (cached) return cached;
  const canvas = canvasOf(puff.width, puff.height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(puff, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  tintedPuffs.set(tone, canvas);
  return canvas;
}

/** An opaque, seamlessly repeating cloud tile of `color`; built once per colour and shared by every scene. */
function cloudTile(color: string): HTMLCanvasElement | null {
  const cached = cloudTiles.get(color);
  if (cached) return cached;
  const tile = canvasOf(TILE_SIZE, TILE_SIZE);
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const tones = cloudTones(color).map(toCss);
  const puff = createPuffCanvas();
  // Seeded, so a colour's clouds look the same in every window and after every reload
  let seed = 7;
  const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < TILE_PUFFS; i++) {
    const radius = 4 + random() * 14;
    const x = random() * TILE_SIZE;
    const y = random() * TILE_SIZE;
    const tinted = tintedPuff(puff, tones[Math.floor(random() * tones.length)] ?? color);
    ctx.globalAlpha = 0.16 + random() * 0.3;
    // Drawn with its wrapped copies, so the tile repeats without seams
    for (const ox of [-TILE_SIZE, 0, TILE_SIZE]) {
      for (const oy of [-TILE_SIZE, 0, TILE_SIZE]) {
        ctx.drawImage(tinted, x + ox - radius, y + oy - radius, radius * 2, radius * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
  cloudTiles.set(color, tile);
  return tile;
}

/**
 * `shape` drawn opaque over `bounds` at `scale`, on a canvas of its own, grown by `spread` canvas
 * pixels on every side. Only a canvas that is `read` back keeps its pixels on the CPU: the clouds'
 * mask is large, and is blurred on the GPU.
 */
function shapeCanvas(shape: QShape, bounds: FogBounds, scale: number, { spread = 0, read = false } = {}): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = canvasOf(bounds.width * scale, bounds.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: read });
  if (!ctx) return null;
  ctx.fillStyle = ctx.strokeStyle = '#000';
  drawFogCoverage(ctx, shape, bounds, scale);
  if (spread > 0 && shape.length > 0) {
    // The filled outline is still the current path: a stroke of twice the spread grows it outwards, into holes too
    ctx.lineWidth = spread * 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  return { canvas, ctx };
}

/**
 * The fog `shape` over `bounds` as clouds of `color` with soft edges, at `CLOUD_SCALE`.
 * Null where there is no Canvas 2D (tests).
 */
export function bakeCloudFog(shape: QShape, bounds: FogBounds, color: string): HTMLCanvasElement | null {
  const tile = cloudTile(color);
  const mask = tile ? shapeCanvas(shape, bounds, CLOUD_SCALE, { spread: EDGE_SPREAD_PX }) : null;
  if (!tile || !mask) return null;
  const canvas = canvasOf(mask.canvas.width, mask.canvas.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.filter = `blur(${EDGE_BLUR_PX}px)`;
  ctx.drawImage(mask.canvas, 0, 0);
  ctx.filter = 'none';
  // The pattern starts at the map's origin, so the clouds stay put when the fog bounds change
  const originX = -bounds.x * CLOUD_SCALE;
  const originY = -bounds.y * CLOUD_SCALE;
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = ctx.createPattern(tile, 'repeat') ?? color;
  ctx.translate(originX, originY);
  ctx.fillRect(-originX, -originY, canvas.width, canvas.height);
  return canvas;
}

/** The fog `shape` sampled once per `cellSize` world pixels, for measuring what a change revealed. */
export function sampleFogMask(shape: QShape, bounds: FogBounds, cellSize: number): FogMask | null {
  const mask = shapeCanvas(shape, bounds, 1 / cellSize, { read: true });
  if (!mask) return null;
  const { canvas, ctx } = mask;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3] ?? 0;
  return { alpha, columns: canvas.width, rows: canvas.height };
}
