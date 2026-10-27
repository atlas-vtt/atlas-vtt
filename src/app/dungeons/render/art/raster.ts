import type { Canvas2D } from '../geometry';

/**
 * A low-resolution field over the map, `res` samples per cell, its first sample's corner at cell
 * (x0, y0). Soft things (washes, shadows, occlusion) are worked out here and drawn scaled up; the
 * vector clip of what they lie on keeps their edges crisp.
 */
export interface Grid {
  x0: number;
  y0: number;
  res: number;
  w: number;
  h: number;
}

export function gridOver(minX: number, minY: number, maxX: number, maxY: number, res: number): Grid {
  return { x0: minX, y0: minY, res, w: Math.ceil((maxX - minX) * res), h: Math.ceil((maxY - minY) * res) };
}

/** The cell-space centre of sample (i, j). */
export function cellOf(grid: Grid, i: number, j: number): { x: number; y: number } {
  return { x: grid.x0 + (i + 0.5) / grid.res, y: grid.y0 + (j + 0.5) / grid.res };
}

/** Fills a field by a function of the cell-space point and the sample's index. */
export function fieldOf(grid: Grid, fn: (x: number, y: number, index: number) => number): Float32Array {
  const out = new Float32Array(grid.w * grid.h);
  for (let j = 0; j < grid.h; j++) {
    const y = grid.y0 + (j + 0.5) / grid.res;
    for (let i = 0; i < grid.w; i++) out[j * grid.w + i] = fn(grid.x0 + (i + 0.5) / grid.res, y, j * grid.w + i);
  }
  return out;
}

/** Bilinear lookup at a cell-space point; outside the grid the edge's value. */
export function sampleField(grid: Grid, values: Float32Array, x: number, y: number): number {
  const fx = Math.min(grid.w - 1.001, Math.max(0, (x - grid.x0) * grid.res - 0.5));
  const fy = Math.min(grid.h - 1.001, Math.max(0, (y - grid.y0) * grid.res - 0.5));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const k = j * grid.w + i;
  const a = values[k]!;
  const b = values[k + 1]!;
  const c = values[k + grid.w]!;
  const d = values[k + grid.w + 1]!;
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

/** A separable box blur of `radius` samples, run `passes` times (three is close to a Gaussian). */
export function blurField(grid: Grid, values: Float32Array, radius: number, passes = 3): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const a = values.slice();
  const b = new Float32Array(a.length);
  const { w, h } = grid;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) {
      const row = j * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[row + Math.min(w - 1, Math.max(0, i))]!;
      for (let i = 0; i < w; i++) {
        b[row + i] = sum / (2 * r + 1);
        sum += a[row + Math.min(w - 1, i + r + 1)]! - a[row + Math.max(0, i - r)]!;
      }
    }
    for (let i = 0; i < w; i++) {
      let sum = 0;
      for (let j = -r; j <= r; j++) sum += b[Math.min(h - 1, Math.max(0, j)) * w + i]!;
      for (let j = 0; j < h; j++) {
        a[j * w + i] = sum / (2 * r + 1);
        sum += b[Math.min(h - 1, j + r + 1) * w + i]! - b[Math.max(0, j - r) * w + i]!;
      }
    }
  }
  return a;
}

/** A colour and alpha per sample, as a canvas the grid's size. */
export function rgbaCanvas(grid: Grid, rgb: [number, number, number], alpha: Float32Array): OffscreenCanvas {
  const pixels = new Uint8ClampedArray(grid.w * grid.h * 4);
  for (let k = 0; k < alpha.length; k++) {
    pixels[k * 4] = rgb[0];
    pixels[k * 4 + 1] = rgb[1];
    pixels[k * 4 + 2] = rgb[2];
    pixels[k * 4 + 3] = Math.max(0, Math.min(1, alpha[k]!)) * 255;
  }
  const canvas = new OffscreenCanvas(grid.w, grid.h);
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, grid.w, grid.h), 0, 0);
  return canvas;
}

/** A canvas whose every sample has its own colour (r, g, b, a in 0..255 per sample). */
export function pixelCanvas(grid: Grid, fill: (k: number, out: Uint8ClampedArray, o: number) => void): OffscreenCanvas {
  const pixels = new Uint8ClampedArray(grid.w * grid.h * 4);
  for (let k = 0; k < grid.w * grid.h; k++) fill(k, pixels, k * 4);
  const canvas = new OffscreenCanvas(grid.w, grid.h);
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, grid.w, grid.h), 0, 0);
  return canvas;
}

/** A field's samples as alpha over one colour, drawn over its cells. */
export function drawField(ctx: Canvas2D, grid: Grid, rgb: [number, number, number], alpha: Float32Array): void {
  drawGridCanvas(ctx, grid, rgbaCanvas(grid, rgb, alpha));
}

/** Draws a grid's canvas over its cells; the context is in cells. */
export function drawGridCanvas(ctx: Canvas2D, grid: Grid, canvas: OffscreenCanvas): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, grid.x0, grid.y0, grid.w / grid.res, grid.h / grid.res);
  ctx.restore();
}

/**
 * Distance in cells from every sample inside `mask` (> 0.5) to the nearest sample outside it, by a
 * two-pass chamfer transform; 0 outside.
 */
export function insideDistance(grid: Grid, mask: Float32Array): Float32Array {
  const { w, h } = grid;
  const big = 1e6;
  const d = new Float32Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = mask[k]! > 0.5 ? big : 0;
  const diag = Math.SQRT2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!d[k]) continue;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1]! + 1);
      if (j > 0) {
        v = Math.min(v, d[k - w]! + 1);
        if (i > 0) v = Math.min(v, d[k - w - 1]! + diag);
        if (i < w - 1) v = Math.min(v, d[k - w + 1]! + diag);
      }
      d[k] = i === 0 || j === 0 ? Math.min(v, 1) : v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (!d[k]) continue;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1]! + 1);
      if (j < h - 1) {
        v = Math.min(v, d[k + w]! + 1);
        if (i < w - 1) v = Math.min(v, d[k + w + 1]! + diag);
        if (i > 0) v = Math.min(v, d[k + w - 1]! + diag);
      }
      d[k] = i === w - 1 || j === h - 1 ? Math.min(v, 1) : v;
    }
  }
  for (let k = 0; k < d.length; k++) d[k] = d[k]! / grid.res;
  return d;
}

/** A path rasterised as a mask on the grid (1 inside); all zero without a canvas. */
export function pathMask(grid: Grid, trace: (path: CanvasPath) => void): Float32Array {
  const out = new Float32Array(grid.w * grid.h);
  if (typeof OffscreenCanvas === 'undefined' || grid.w < 1 || grid.h < 1) return out;
  const canvas = new OffscreenCanvas(grid.w, grid.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(grid.res, 0, 0, grid.res, -grid.x0 * grid.res, -grid.y0 * grid.res);
  ctx.beginPath();
  trace(ctx);
  ctx.fillStyle = '#000';
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, grid.w, grid.h);
  for (let k = 0; k < out.length; k++) out[k] = data[k * 4 + 3]! / 255;
  return out;
}

/** Per whole cell, whether the field is above nothing anywhere in or beside it. */
export function activeCells(grid: Grid, field: Float32Array): (x: number, y: number) => boolean {
  const x0 = Math.floor(grid.x0);
  const y0 = Math.floor(grid.y0);
  const w = Math.ceil(grid.w / grid.res) + 2;
  const h = Math.ceil(grid.h / grid.res) + 2;
  const on = new Uint8Array(w * h);
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (field[j * grid.w + i]! <= 0) continue;
      const cx = Math.floor(grid.x0 + (i + 0.5) / grid.res) - x0;
      const cy = Math.floor(grid.y0 + (j + 0.5) / grid.res) - y0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = cx + dx;
        const Y = cy + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) on[Y * w + X] = 1;
      }
    }
  }
  return (x, y) => {
    const X = Math.floor(x) - x0;
    const Y = Math.floor(y) - y0;
    return X >= 0 && Y >= 0 && X < w && Y < h && on[Y * w + X] === 1;
  };
}
