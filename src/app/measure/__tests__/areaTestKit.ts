import type { GridGeometry } from '../../grid/gridDistance';
import { distToSeg } from '../../lighting/segments';
import type { Point } from '../../types/visionTypes';
import { pointInPolygon } from '../../vision/visibility';
import type { AreaShapeRules, MeasureArea } from '../measureGeometry';
import { cellCentreAt, cellKeyAt } from '../measureGrid';
import type { MeasureShapeKind } from '../measureTypes';

export const SQUARE: GridGeometry = { type: 'square', size: 70, offsetX: 13, offsetY: -22 };
export const POINTY: GridGeometry = { type: 'hex-vertical', size: 70, offsetX: 13, offsetY: -22 };
export const FLAT: GridGeometry = { type: 'hex-horizontal', size: 64, offsetX: -7, offsetY: 31 };
export const GRIDS: readonly (readonly [string, GridGeometry])[] = [['square', SQUARE], ['pointy hexes', POINTY], ['flat hexes', FLAT]];

export const AREA_SHAPES: readonly Exclude<MeasureShapeKind, 'ruler'>[] = ['circle', 'cone', 'square', 'line'];

export const RULES: AreaShapeRules = { coneAngle: 53.13, coneEnd: 'round', lineWidth: 70 };

/** Mulberry32: the same numbers for the same seed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far `point` lies from the nearest edge of `area`'s outline. */
export function distanceToOutline(area: MeasureArea, point: Point): number {
  let least = Infinity;
  for (const ring of area.rings) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      least = Math.min(least, distToSeg(point.x, point.y, [a.x, a.y, b.x, b.y]));
    });
  }
  return least;
}

/** Whether `point` lies inside the outline's rings, counted as the outline is drawn. */
export function inOutline(area: MeasureArea, point: Point): boolean {
  return area.rings.reduce((inside, ring) => inside !== pointInPolygon(point, [...ring]), false);
}

/** A cell of the grid for the oracle: its name, its centre and how much of it the area holds, by dense sampling. */
export interface SampledCell {
  key: string;
  centre: Point;
  share: number;
}

/**
 * Every cell with a part within `margin` of `area`'s bounds, with the share of it inside the area:
 * points `step` apart over the whole region, each asked of the area itself and counted for the
 * cell it lies in.
 */
export function sampledCells(grid: GridGeometry, area: MeasureArea, step = grid.size / 16, margin = grid.size * 1.5): Map<string, SampledCell> {
  const cells = new Map<string, SampledCell & { inside: number; samples: number }>();
  const { minX, minY, maxX, maxY } = area.bounds;
  for (let y = minY - margin + step / 2; y < maxY + margin; y += step) {
    for (let x = minX - margin + step / 2; x < maxX + margin; x += step) {
      const point = { x, y };
      const key = cellKeyAt(grid, point);
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { key, centre: cellCentreAt(grid, point), share: 0, inside: 0, samples: 0 }));
      cell.samples++;
      if (area.contains(point)) cell.inside++;
    }
  }
  // Cells at the region's rim were sampled in part only: their share says nothing.
  const whole = Math.max(...[...cells.values()].map((cell) => cell.samples)) * 0.8;
  const sampled = new Map<string, SampledCell>();
  for (const cell of cells.values()) {
    if (cell.samples >= whole) sampled.set(cell.key, { key: cell.key, centre: cell.centre, share: cell.inside / cell.samples });
  }
  return sampled;
}
