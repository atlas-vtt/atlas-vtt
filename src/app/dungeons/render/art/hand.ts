import type { Bounds, Vec } from '../geometry';
import type { ArtScene } from './artScene';
import { SHADOW_DIR } from './light';
import { grown, type Field, type PathFn } from './paths';
import { blurField, gridOver, sampleField } from './raster';

/** What a surface is made of; each direction gives it its own colour and texture. */
/** `raised`: the top of a platform, lighter than the floor it stands on; `glass`: a window's pane, pale and smooth, without texture. */
export type Material = 'stone' | 'dressed' | 'rock' | 'wood' | 'rope' | 'floor' | 'raised' | 'metal' | 'cloth' | 'glass';
export type Weight = 'heavy' | 'outline' | 'fine';

/** A stone of a pile of loose rock: its outline, middle and reach, in cells. */
export interface PileStone {
  poly: Vec[];
  c: Vec;
  r: number;
}

/**
 * A direction's hand: how it darkens, fills, draws a line, marks a raised or sunken edge, models a
 * small solid and lays water. Terrain, passages and stairs are drawn once, through a hand, so
 * every look draws the same things in its own manner.
 */
export interface Hand {
  scene: ArtScene;
  /** Darkens by `field` (0..1) within `bounds`, inside `clip` if given: a shadow, or depth going down into darkness. */
  tone(field: Field, bounds: Bounds, clip: PathFn | null, kind: 'shade' | 'depth'): void;
  surface(path: PathFn, material: Material): void;
  /** The material's colour over `path`, without its texture: for parts too small or too plain to show it. */
  fill(path: PathFn, material: Material): void;
  line(runs: readonly (readonly Vec[])[], weight: Weight, closed?: boolean): void;
  /** A polygon's edges, as standing up from the floor (`raised`) or falling away below it. */
  edges(polygon: readonly Vec[], raised: boolean): void;
  /** Models a small solid within `path` (already filled), lit from the top left. */
  solid(path: PathFn, centre: Vec, radius: number, strength?: number): void;
  /** Water in `pools`, its depth by `depth` (cells from the shore); deep water falls away steeply. */
  water(pools: readonly Vec[][], depth: Field, deep: boolean): void;
  /** Molten rock in `pools`, its glow spilling onto the floor round it. */
  lava(pools: readonly Vec[][], tint: 'lava' | 'acid'): void;
  /** A glyph's colours in `material`: what it is filled with and inked in. */
  paint(material: Material): { fill: string; ink: string };
  /** The material's texture laid over `path` (already filled), without filling it again. */
  grain(path: PathFn, material: Material): void;
  /** A line weight, in cells. */
  weight(weight: Weight): number;
  /**
   * A pile of rock stones, back to front: each opaque over those it lies on, outlined `weight`. A
   * direction that models each stone draws the pile whole; without it, the caller draws its stones.
   */
  pile?(stones: readonly PileStone[], weight: (stone: PileStone) => Weight): void;
}

/**
 * The soft shadow of whatever `path` adds, `lift` above what it falls on: the shape moved along
 * the light's fall and blurred the more the farther it falls, as a field.
 */
export function shadowField(scene: ArtScene, path: PathFn, lift: number, bounds: Bounds): { field: Field; bounds: Bounds } {
  const b = grown(bounds, lift * 1.4 + 0.3);
  const res = scene.grid.res;
  const grid = gridOver(b.minX, b.minY, b.maxX, b.maxY, res);
  if (typeof OffscreenCanvas === 'undefined' || grid.w < 1 || grid.h < 1) return { field: () => 0, bounds: b };
  const canvas = new OffscreenCanvas(grid.w, grid.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(res, 0, 0, res, (-grid.x0 + SHADOW_DIR.x * lift) * res, (-grid.y0 + SHADOW_DIR.y * lift) * res);
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = '#000';
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, grid.w, grid.h);
  const raw = new Float32Array(grid.w * grid.h);
  for (let k = 0; k < raw.length; k++) raw[k] = data[k * 4 + 3]! / 255;
  const soft = blurField(grid, raw, Math.max(1, res * (0.03 + lift * 0.12)), 3);
  return { field: (x, y) => sampleField(grid, soft, x, y), bounds: b };
}

/** Casts the shadow of `path` from `lift` onto whatever lies under it, within `clip` if given. */
export function castShadow(hand: Hand, path: PathFn, lift: number, bounds: Bounds, strength = 0.75, clip: PathFn | null = null): void {
  if (!hand.scene.env.view.shadow) return;
  const { field, bounds: b } = shadowField(hand.scene, path, lift, bounds);
  hand.tone((x, y) => field(x, y) * strength, b, clip, 'shade');
}
