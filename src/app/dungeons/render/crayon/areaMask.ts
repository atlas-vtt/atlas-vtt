import { grown, type PathFn } from '../art/paths';
import { gridOver, pathMask } from '../art/raster';
import type { Bounds } from '../geometry';

/** Samples per cell of an area's mask, and the most samples one mask may hold. */
const RESOLUTION = 10;
const MOST_SAMPLES = 1_000_000;

/** Where an area lies, read every `step` cells along a line of strokes. */
export interface AreaMask {
  at: (x: number, y: number) => boolean;
  step: number;
}

/**
 * Where an area lies, at a tenth of a cell, so its strokes are laid only along the runs inside it:
 * a thin area (a path round a lawn, a boundary wall) has a box many times its size.
 */
export function areaMask(path: PathFn, bounds: Bounds): AreaMask | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (!(width > 0 && height > 0)) return null;
  const res = Math.min(RESOLUTION, Math.sqrt(MOST_SAMPLES / (width * height)));
  const box = grown(bounds, 1 / res);
  const grid = gridOver(box.minX, box.minY, box.maxX, box.maxY, res);
  const cover = pathMask(grid, path);
  return {
    step: 1 / res,
    at: (x, y) => {
      const i = Math.floor((x - grid.x0) * res);
      const j = Math.floor((y - grid.y0) * res);
      return i >= 0 && j >= 0 && i < grid.w && j < grid.h && cover[j * grid.w + i]! > 0;
    },
  };
}
