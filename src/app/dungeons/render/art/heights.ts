import { pointInPolygon, tracePolygon, traceShapes, type Canvas2D, type FloorShape, type Vec } from '../geometry';
import type { PathFn } from './paths';
import type { Grid } from './raster';

/** Something that stands on the floor: its footprint and its height (a wall's is 1). */
export interface Stand {
  /** Adds its footprint to the path; it may move the context's frame while it traces, and puts it back. */
  path: (ctx: Canvas2D) => void;
  height: number;
}

/** What stands over the map as heights (rock and walls 1), and the rock the floors close in on. */
export interface Relief {
  heights: Float32Array;
  /** 1 in a narrow pocket of rock: shaded whole. */
  pocket: Float32Array;
}

const grey = (h: number): string => {
  const v = Math.round(Math.max(0, Math.min(1, h)) * 255);
  return `rgb(${v}, 0, 0)`;
};

/**
 * Rasterises the relief on a canvas the grid's size: heights in red (whatever lies outside the
 * floors is rock, as tall as a wall, but the open ground before each way in), pockets in green.
 * Without a canvas (outside a browser) the floors and open ground alone, from the field.
 */
export function rasterRelief(grid: Grid, floors: readonly FloorShape[], open: readonly (readonly Vec[])[], pockets: readonly (readonly Vec[])[], stands: readonly Stand[], outside: (x: number, y: number) => boolean, ground: PathFn | null = null): Relief {
  const size = grid.w * grid.h;
  if (typeof OffscreenCanvas === 'undefined') {
    const heights = new Float32Array(size);
    const rock = (x: number, y: number): boolean => outside(x, y) && !open.some(ring => pointInPolygon(ring, x, y));
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) heights[j * grid.w + i] = rock(grid.x0 + (i + 0.5) / grid.res, grid.y0 + (j + 0.5) / grid.res) ? 1 : 0;
    return { heights, pocket: new Float32Array(size) };
  }
  const canvas = new OffscreenCanvas(grid.w, grid.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, grid.w, grid.h);
  ctx.setTransform(grid.res, 0, 0, grid.res, -grid.x0 * grid.res, -grid.y0 * grid.res);
  ctx.beginPath();
  traceShapes(ctx, floors);
  ctx.fillStyle = '#000000';
  ctx.fill();
  for (const ring of open) {
    ctx.beginPath();
    tracePolygon(ctx, ring);
    ctx.fill();
  }
  if (ground) {
    ctx.beginPath();
    ground(ctx);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighten';
  for (const stand of [...stands].sort((a, b) => a.height - b.height)) {
    ctx.beginPath();
    stand.path(ctx);
    ctx.fillStyle = grey(stand.height);
    ctx.fill();
  }
  ctx.beginPath();
  for (const ring of pockets) {
    ring.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }
  ctx.fillStyle = '#00ff00';
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, grid.w, grid.h);
  const heights = new Float32Array(size);
  const pocket = new Float32Array(size);
  for (let k = 0; k < size; k++) {
    heights[k] = data[k * 4]! / 255;
    pocket[k] = data[k * 4 + 1]! / 255;
  }
  return { heights, pocket };
}
