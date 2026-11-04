/**
 * The surface a dungeon is drawn on: vellum in the look's own colour, as the Cairn tokens' backdrop
 * is in their creature's. Lighter where the dungeon lies, deeper towards the edges, with the skin's
 * grain (`vellumSkin.ts`) over it; a dark look keeps a dark skin. Every dungeon shows its own part
 * of one skin, chosen by its seed, so a dungeon always looks the same.
 */

import { stream } from '../rng';
import { boundedCached } from './boundedCache';
import type { Canvas2D } from './geometry';
import { DEFAULT_PX_PER_CELL, type MapLayout } from './layoutSize';
import { luminance, mixColours, parseHex, type Rgb } from './palette';
import { cloudTile, deviationPixels, poreTile } from './vellumSkin';

/** A tile of the skin: its side in pixels, and how many cells it covers on the map. */
interface TileSpec {
  kind: 'clouds' | 'pores';
  px: number;
  cells: number;
}

/**
 * The pores are made at a scene map's own resolution (`DEFAULT_PX_PER_CELL`), one texel a pixel, so
 * the grain stays crisp where it matters; smaller pictures draw them reduced. The clouds are soft
 * by nature and need far fewer texels.
 */
const TILES: readonly TileSpec[] = [
  { kind: 'clouds', px: 1024, cells: 32 },
  { kind: 'pores', px: 3 * DEFAULT_PX_PER_CELL, cells: 3 },
];

/** One skin for every dungeon; the seed only picks where on it a dungeon lies. */
const SKIN_SEED = 0x5ca1f;
/** Below this brightness a surface is dark: it lightens towards the middle instead. */
const DARK = 0.4;
/** The least brightness the grain is measured against, so a dark skin still shows it. */
const GRAIN_FLOOR = 0.32;
/** The grain on a map, against the token backdrop's: a map shows far more of the skin at once. */
const GRAIN = 0.75;
/** The brightest the skin gets, so it can still lighten where its grain does: vellum is never paper white. */
const BRIGHTEST = 0.975;

function toHsv([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = ((g - b) / 255 / d) % 6;
    else if (max === g / 255) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
  }
  return [((h * 60) + 360) % 360, max === 0 ? 0 : d / max, max];
}

function fromHsv(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return `#${[r, g, b].map(n => Math.round(Math.min(1, Math.max(0, n + m)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** The skin's colour where the dungeon lies and at the edges, from the look's paper. */
export function vellumColours(paper: string): { inner: string; outer: string } {
  const [h, s, v] = toHsv(parseHex(paper));
  if (v < DARK) return { inner: fromHsv(h, s, v * 1.3), outer: fromHsv(h, Math.min(1, s * 1.1), v * 0.74) };
  const top = Math.min(BRIGHTEST, v * 1.035);
  return { inner: fromHsv(h, s * 0.82, top), outer: fromHsv(h, Math.min(1, s * 1.22 + 0.02), Math.min(top, v) * 0.88) };
}

const deviations = new Map<TileSpec['kind'], Float32Array>();
const tiles = new Map<string, OffscreenCanvas>();
/** Grain canvases kept: both tiles of the last few looks (the gallery draws all of them in turn). */
const TILE_LIMIT = 6;

/** A tile's grain as a canvas for a surface of `paper`, made once per tile and colour. */
function tileFor(spec: TileSpec, paper: string, contrast: number): OffscreenCanvas {
  return boundedCached(tiles, `${spec.kind}:${paper}:${contrast}`, TILE_LIMIT, () => grainTile(spec, paper, contrast));
}

function grainTile(spec: TileSpec, paper: string, contrast: number): OffscreenCanvas {
  let deviation = deviations.get(spec.kind);
  if (!deviation) {
    deviation = spec.kind === 'clouds' ? cloudTile(spec.px, SKIN_SEED) : poreTile(spec.px, SKIN_SEED + 1);
    deviations.set(spec.kind, deviation);
  }
  const surface = luminance(parseHex(paper)) / 255;
  const tile = new OffscreenCanvas(spec.px, spec.px);
  tile.getContext('2d')!.putImageData(new ImageData(deviationPixels(deviation, Math.min(surface, BRIGHTEST), Math.max(surface, GRAIN_FLOOR) * GRAIN * contrast), spec.px), 0, 0);
  return tile;
}

/** Whether the context draws gradients and patterns (a canvas does; the SVG recorder does not). */
function paints(ctx: Canvas2D): boolean {
  return typeof ctx.createRadialGradient === 'function' && typeof ctx.createPattern === 'function';
}

/**
 * Fills the map's `layout` with the vellum, its grain at `grain` (smooth paper below 1) and `contrast` times as strong (a dark tint shows little of it), its pores only where `pores` says so
 * (they are a single pixel's grain, which a lossless image cannot compress). Monochrome, and a context without gradients (the SVG
 * export), get the plain paper; a context outside a browser gets the colours without the grain.
 */
export function drawVellum(ctx: Canvas2D, paper: string, layout: MapLayout, seed: number, plain: boolean, grain = 1, pores = grain >= 1, contrast = 1): void {
  const { widthPx: w, heightPx: h, pxPerCell } = layout;
  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  if (plain || !paints(ctx)) {
    ctx.restore();
    return;
  }
  const { inner, outer } = vellumColours(paper);
  const gradient = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.hypot(w, h) * 0.62);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    gradient.addColorStop(t, mixColours(inner, outer, t ** 1.4));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  if (typeof OffscreenCanvas !== 'undefined') {
    const rng = stream(seed, 'render', 'vellum');
    for (const spec of TILES) {
      // Both tiles take their offsets, so a part of the skin drawn again lies on the skin.
      const ox = -rng() * spec.px;
      const oy = -rng() * spec.px;
      if (spec.kind === 'pores' && !pores) continue;
      const pattern = ctx.createPattern(tileFor(spec, paper, contrast), 'repeat');
      if (!pattern) continue;
      const scale = (spec.cells * pxPerCell) / spec.px;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(ox, oy);
      ctx.fillStyle = pattern;
      ctx.globalAlpha = grain;
      ctx.fillRect(-ox, -oy, w / scale, h / scale);
      ctx.restore();
    }
  }
  ctx.restore();
}

