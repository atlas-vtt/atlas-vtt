import { hash2, noiseSampler } from '../art/noise';
import { SHADOW_DIR } from '../art/light';
import { gridOver, sampleField, type Grid } from '../art/raster';
import type { MossSpot } from './growthForms';

/**
 * A cluster of moss as many small cushions packed together (cells of a jittered lattice, Worley's
 * nearest point): each a low dome lit on its side towards the light, the crevices between them
 * dark. A cushion is moss or bare floor as a whole, by how thick the cluster is at its middle, so
 * the cluster's edge is the cushions' lumpy outline and frays into single ones, never a blur.
 */
export interface MossField {
  grid: Grid;
  /** 0..1, how much of a sample moss covers. */
  cover: Float32Array;
  /** 0..1, from a crevice's depth to a cushion's lit shoulder. */
  light: Float32Array;
}

/** Cushions across a cell. */
const CUSHIONS = 38;

/** Samples per cell, by how large a cell is drawn: two or three pixels a sample, so each cushion has its shape. */
export function mossResolution(pxPerCell: number): number {
  return Math.round(Math.max(12, Math.min(160, pxPerCell / 2.5)));
}

function boundsOf(spots: readonly MossSpot[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of spots) {
    minX = Math.min(minX, s.x - s.radius * 1.6);
    minY = Math.min(minY, s.y - s.radius * 1.6);
    maxX = Math.max(maxX, s.x + s.radius * 1.6);
    maxY = Math.max(maxY, s.y + s.radius * 1.6);
  }
  return { minX, minY, maxX, maxY };
}

/** How thick the cluster is over a coarse grid: the spots summed, broken by broad noise. */
function thickness(spots: readonly MossSpot[], b: ReturnType<typeof boundsOf>, seed: number): { grid: Grid; values: Float32Array } {
  const grid = gridOver(b.minX, b.minY, b.maxX, b.maxY, 12);
  const values = new Float32Array(grid.w * grid.h);
  const broad = noiseSampler(seed + 61, 2.5, 4, 4);
  for (let j = 0; j < grid.h; j++) {
    const y = grid.y0 + (j + 0.5) / grid.res;
    for (let i = 0; i < grid.w; i++) {
      const x = grid.x0 + (i + 0.5) / grid.res;
      let v = 0;
      for (const s of spots) {
        const d2 = ((x - s.x) ** 2 + (y - s.y) ** 2) / (s.radius * s.radius);
        if (d2 < 9) v += s.strength * Math.exp(-d2 * 1.4);
      }
      values[j * grid.w + i] = Math.min(1.4, v) + (broad(x, y) - 0.5) * 0.8;
    }
  }
  return { grid, values };
}

export function mossField(spots: readonly MossSpot[], res: number, seed: number): MossField | null {
  if (!spots.length) return null;
  const b = boundsOf(spots);
  const thick = thickness(spots, b, seed);
  const grid = gridOver(b.minX, b.minY, b.maxX, b.maxY, res);
  const cover = new Float32Array(grid.w * grid.h);
  const light = new Float32Array(grid.w * grid.h);
  const aa = CUSHIONS / res;
  const broad = noiseSampler(seed + 64, 1.2, 4, 3);
  for (let j = 0; j < grid.h; j++) {
    const y = grid.y0 + (j + 0.5) / res;
    for (let i = 0; i < grid.w; i++) {
      const x = grid.x0 + (i + 0.5) / res;
      const gx = x * CUSHIONS;
      const gy = y * CUSHIONS;
      const cx = Math.floor(gx);
      const cy = Math.floor(gy);
      let f1 = 9;
      let f2 = 9;
      let px = 0;
      let py = 0;
      let size = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const fx = cx + dx + hash2(cx + dx, cy + dy, seed);
          const fy = cy + dy + hash2(cx + dx, cy + dy, seed + 7);
          // Cushions of several sizes: a larger one claims more of the ground round it.
          const s = 0.75 + 0.5 * hash2(cx + dx, cy + dy, seed + 13);
          const d = Math.hypot(gx - fx, gy - fy) / s;
          if (d < f1) {
            f2 = f1;
            f1 = d;
            px = fx;
            py = fy;
            size = s;
          } else if (d < f2) f2 = d;
        }
      }
      const at = sampleField(thick.grid, thick.values, px / CUSHIONS, py / CUSHIONS);
      const keep = at - 0.38 - hash2(Math.floor(px * 7), Math.floor(py * 7), seed + 3) * 0.22;
      if (keep <= 0) continue;
      // The crevice: where the two nearest cushions meet.
      const crevice = Math.min(1, (f2 - f1) / 0.35);
      const dome = Math.max(0, 1 - f1 * f1 * 0.55);
      const k = j * grid.w + i;
      // A cushion deep in the cluster fills its whole cell; towards the edge it shrinks to a rounded tuft.
      const reach = Math.min(1.6, 0.5 + keep * 4);
      const edge = Math.max(0, Math.min(1, (reach - f1) / aa + 0.5));
      cover[k] = edge * Math.min(1, 0.6 + keep * 2.5) * (0.84 + 0.16 * Math.min(1, crevice / aa));
      const facing = -((gx - px) * SHADOW_DIR.x + (gy - py) * SHADOW_DIR.y) / size;
      const speck = hash2(i, j, seed + 29) - 0.5;
      light[k] = Math.max(0, Math.min(1, 0.4 + facing * 0.2 * dome + (dome - 0.5) * 0.16 - (1 - crevice) * 0.22 + (at - 0.6) * 0.3 + (broad(x, y) - 0.5) * 0.5 + speck * 0.12));
    }
  }
  return { grid, cover, light };
}
