import type { Bounds, Canvas2D, Vec } from '../geometry';
import type { PathFn } from '../art/paths';
import { hash2 } from '../art/noise';
import type { Crown } from './crowns';

/**
 * What the grounds need of a painter beyond its hand: the living and loose surfaces a house's
 * dungeon never had, the glass a greenhouse is roofed with, and how deep the shade on the open
 * ground is cut. Stone & shadow paints them in their colours; Engraved cuts them in ink.
 */
export interface GroundsPaint {
  /** Mown grass over `path`, its blades scattered over `cells`. */
  lawn(path: PathFn, cells: readonly Vec[]): void;
  /** Raked gravel over `path`, its pebbles scattered over `cells`. */
  gravel(path: PathFn, cells: readonly Vec[]): void;
  /** A clipped hedge's dense leaves inside `rings`: clumps of about `clump` cells, lit on the side towards the light, scattered over `cells`. */
  foliage(rings: readonly Vec[][], clump: number, salt: number, cells: readonly Vec[]): void;
  /** A tree's crown seen from above, its masses of leaves from the lowest up. */
  crown(crown: Crown): void;
  /** Still water in a basin `path`, deepening towards `centre`. */
  pool(path: PathFn, centre: Vec, radius: number): void;
  /** Panes of glass over `path` that show what lies under them. */
  glass(path: PathFn): void;
  /** How much of the scene's shade the open ground takes, and how dark a tree's own shadow is. */
  shade: { ground: number; tree: number };
}

/** Draws inside `path` until `draw` returns; `path` stays the current path, so `draw` may fill it first. */
export function withClip(ctx: Canvas2D, path: PathFn, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  draw();
  ctx.restore();
}

export interface Scattered {
  x: number;
  y: number;
  /** 0..1, for the drawing to use. */
  t: number;
}

/** Points scattered over `bounds` about `per` to a cell, each jittered within its share. */
function scatterIn(bounds: Bounds, per: number, seed: number, out: Scattered[]): void {
  const step = 1 / Math.sqrt(per);
  for (let j = Math.floor(bounds.minY / step); j * step < bounds.maxY; j++) {
    for (let i = Math.floor(bounds.minX / step); i * step < bounds.maxX; i++) {
      out.push({ x: (i + hash2(i, j, seed)) * step, y: (j + hash2(i, j, seed + 1)) * step, t: hash2(i, j, seed + 2) });
    }
  }
}

/** Points scattered about `per` to a cell over `area`: a box, or only the cells given, which a long hedge or a lawn round a house fill a small part of the box of. */
export function scatter(area: Bounds | readonly Vec[], per: number, seed: number): Scattered[] {
  const out: Scattered[] = [];
  if ('minX' in area) scatterIn(area, per, seed, out);
  else for (const c of area) scatterIn({ minX: c.x, minY: c.y, maxX: c.x + 1, maxY: c.y + 1 }, per, seed, out);
  return out;
}

/** Pebbles at `points`, each a small ring at least `size` across, in the context's stroke. */
export function tracePebbles(ctx: Canvas2D, points: readonly Scattered[], size: number): void {
  for (const p of points) {
    const r = size + 0.012 * p.t;
    ctx.moveTo(p.x + r, p.y);
    ctx.ellipse(p.x, p.y, r, r * 0.75, p.t * 3, 0, Math.PI * 2);
  }
}
