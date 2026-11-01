import type { Hand } from '../art/hand';
import { noiseSampler } from '../art/noise';
import { clipFloors } from '../art/outline';
import { polysPath, smoothstep, type Field, type PathFn } from '../art/paths';
import { gridOver, type Grid } from '../art/raster';
import { pointsBounds, type Bounds, type Canvas2D, type Vec } from '../geometry';
import { mixColours, parseHex, withAlpha } from '../palette';
import { insetRuns } from '../shore';
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

/**
 * A thin sheet of water: the hand's colours, seeded sheen and vector shore over the floor grain.
 * Constant base/depth are combined algebraically; sheen is bilinearly sampled at up to 12
 * samples/cell instead of the hand's full-resolution intermediate and high-quality smoothing.
 */
export function smallShallowPools(hand: Hand, pools: readonly Vec[][], depth: number): void {
  const { scene } = hand;
  if (!scene.raster || scene.env.style.direction !== 'stone') {
    hand.water(pools, () => depth, false);
    return;
  }
  const c = stoneColours(scene.env.palette, scene.env.view.monochrome);
  const { ctx } = scene.env;
  const trace = polysPath(pools);
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = withAlpha(c.dark ? '#000000' : c.line, 0.1);
  ctx.lineWidth = 0.14;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // These gours are too shallow for a depth gradient. Fold the hand's base and constant
  // depth into one translucent fill; the floor's original grain shows through unchanged.
  const body = smoothstep(0, 1.1, depth) ** 0.9 * (c.mono ? 0.3 : 0.75);
  const base = c.mono ? 0.35 : 0.55;
  const alpha = body + base * (1 - body);
  const dark = c.mono ? c.line : mixColours(c.water, c.dark ? '#000000' : c.line, 0.42);
  ctx.fillStyle = withAlpha(mixColours(c.water, dark, body / alpha), alpha);
  ctx.fill();
  if (!c.mono && depth > 0.05) {
    const area = pointsBounds(pools.flat());
    const grid = gridOver(area.minX - 0.1, area.minY - 0.1, area.maxX + 0.1, area.maxY + 0.1, Math.min(12, scene.grid.res));
    const sheen = noiseSampler(scene.env.dungeon.model.seed + 41, 7, 2, 3);
    const rgb = parseHex(c.dark ? c.light : '#ffffff');
    ctx.save();
    ctx.clip();
    fieldImage(ctx, grid, (x, y, pixels, offset) => {
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = Math.max(0, sheen(x + y * 0.35, y) - 0.52) * (c.dark ? 0.25 : 0.55) * 255;
    });
    ctx.restore();
  }
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = withAlpha(c.dark ? '#000000' : c.line, 0.5);
  ctx.lineWidth = 0.011;
  ctx.stroke();
  ctx.beginPath();
  for (const pool of pools) for (const run of insetRuns(pool, 0.028)) {
    ctx.moveTo(run[0]!.x, run[0]!.y);
    for (const p of run.slice(1)) ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = withAlpha(c.light, c.dark ? 0.14 : 0.45);
  ctx.lineWidth = 0.008;
  ctx.stroke();
  ctx.restore();
}
