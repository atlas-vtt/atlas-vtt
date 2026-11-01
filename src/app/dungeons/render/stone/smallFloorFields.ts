import type { Hand } from '../art/hand';
import type { Field, PathFn } from '../art/paths';
import { gridOver, type Grid } from '../art/raster';
import type { Bounds, Canvas2D } from '../geometry';
import { parseHex } from '../palette';
import { stoneColours, type StoneColours } from './colours';

/** A wrapper per immutable painter hand, released with its scene. */
const hands = new WeakMap<Hand, Hand>();

/** One reusable sample buffer; it holds no scene, path or cached drawing. */
let scratch: { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D; pixels: ImageData } | undefined;

/** Draw a small field directly, without a second full-resolution compositing layer. */
function fieldImage(ctx: Canvas2D, grid: Grid, fill: (x: number, y: number, pixels: Uint8ClampedArray, offset: number) => void): void {
  if (grid.w < 1 || grid.h < 1) return;
  if (!scratch || scratch.canvas.width !== grid.w || scratch.canvas.height !== grid.h) {
    const canvas = new OffscreenCanvas(grid.w, grid.h);
    const buffer = canvas.getContext('2d')!;
    scratch = { canvas, ctx: buffer, pixels: buffer.createImageData(grid.w, grid.h) };
  }
  const { pixels, canvas } = scratch;
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) fill(grid.x0 + (i + 0.5) / grid.res, grid.y0 + (j + 0.5) / grid.res, pixels.data, (j * grid.w + i) * 4);
  const uniform = pixels.data.every((value, index) => value === pixels.data[index % 4]);
  if (uniform) {
    ctx.fillStyle = `rgba(${pixels.data[0]},${pixels.data[1]},${pixels.data[2]},${pixels.data[3]! / 255})`;
    ctx.fillRect(grid.x0, grid.y0, grid.w / grid.res, grid.h / grid.res);
    return;
  }
  scratch.ctx.putImageData(pixels, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(canvas, grid.x0, grid.y0, grid.w / grid.res, grid.h / grid.res);
}

/**
 * Stone's small floor coatings use the same fields, colours and vector shores as its hand.
 * Soft stains are bilinearly sampled at up to eight samples per cell, then composited directly.
 * This avoids a full-resolution intermediate layer while preserving the floor's grain.
 * Engraved and SVG keep the original hand. Surfaces/grain/solid/edges are never replaced.
 */
export function smallFloorHand(hand: Hand): Hand {
  const { scene } = hand;
  if (!scene.raster || scene.env.style.direction !== 'stone') return hand;
  const cached = hands.get(hand);
  if (cached) return cached;
  const c = stoneColours(scene.env.palette, scene.env.view.monochrome);
  const small: Hand = {
    ...hand,
    tone: (field, bounds, clip, kind) => stain(hand, c, field, bounds, clip, kind),
  };
  hands.set(hand, small);
  return small;
}

function stain(hand: Hand, c: StoneColours, field: Field, bounds: Bounds, clip: PathFn | null, kind: 'shade' | 'depth'): void {
  const { ctx } = hand.scene.env;
  const deep = kind === 'depth';
  const rgb = parseHex(deep ? '#000000' : c.shadow);
  const grid = gridOver(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, Math.min(8, hand.scene.grid.res));
  ctx.save();
  if (clip) { ctx.beginPath(); clip(ctx); ctx.clip(); }
  ctx.globalCompositeOperation = deep || c.dark ? 'source-over' : 'multiply';
  fieldImage(ctx, grid, (x, y, pixels, offset) => {
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
    pixels[offset + 3] = Math.min(1, field(x, y)) * (deep ? 1 : 0.8) * 255;
  });
  ctx.restore();
}
