/**
 * The ambient light of a scene with light zones, laid on a grid of texels: what a roof is lit by,
 * and what decides where the players see one (`roofSeenAt`). Each texel takes the light at its
 * centre, as `ambientAt` reads it there (the topmost zone whose polygon holds it, else the scene's),
 * and the rule and the picture both read these bytes, so they agree to the texel.
 */

import type { LightLevel } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import { ambientLevel } from '../vision/lightLevels';
import type { AmbientLight } from '../vision/sight';

/** The texels of an ambient raster from the world's origin, `texel` world pixels a side. */
export interface AmbientGrid {
  texel: number;
  columns: number;
  rows: number;
}

/** The ambient light by texel, row by row. */
export interface AmbientRaster {
  grid: AmbientGrid;
  /** The light level the ambient light gives the texel: `LEVEL_CODES`. */
  levels: Uint8Array;
  /** The ambient light itself, 0–255 for 0–1, for the roof's colour. */
  light: Uint8Array;
}

/** How a light level is written into a raster (and read by the roof's shader). */
export const LEVEL_CODES = { dark: 0, dim: 1, bright: 2 } as const;
const LEVELS: readonly LightLevel[] = ['dark', 'dim', 'bright'];

function code(light: AmbientLight, ambient: number): number {
  const level = ambientLevel({ ...light, ambient });
  return level === 'bright' ? LEVEL_CODES.bright : level === 'dim' ? LEVEL_CODES.dim : LEVEL_CODES.dark;
}

function byte(ambient: number): number {
  return Math.round(Math.min(1, Math.max(0, ambient)) * 255);
}

/** The scene's ambient light on `grid`, its zones painted over it in their order; null for a scene without zones, which is lit alike everywhere. */
export function ambientRaster(light: AmbientLight, grid: AmbientGrid): AmbientRaster | null {
  const zones = light.zones ?? [];
  if (zones.length === 0) return null;
  const size = grid.columns * grid.rows;
  const levels = new Uint8Array(size).fill(code(light, light.ambient));
  const lit = new Uint8Array(size).fill(byte(light.ambient));
  for (const zone of zones) paintZone(zone.polygon, grid, (from, to) => {
    levels.fill(code(light, zone.ambient), from, to);
    lit.fill(byte(zone.ambient), from, to);
  });
  return { grid, levels, light: lit };
}

/**
 * Calls `fill(from, to)` for each run of texels in a row whose centre lies inside `polygon`, by
 * the crossings `pointInPolygon` counts (even-odd): a centre is inside where an odd number of the
 * outline's crossings with its row lie to its right.
 */
function paintZone(polygon: readonly Point[], grid: AmbientGrid, fill: (from: number, to: number) => void): void {
  const { texel, columns, rows } = grid;
  const ys = polygon.map((p) => p.y);
  const first = Math.max(0, Math.floor(Math.min(...ys) / texel - 0.5));
  const last = Math.min(rows - 1, Math.ceil(Math.max(...ys) / texel + 0.5));
  const crossings: number[] = [];
  for (let row = first; row <= last; row++) {
    const y = (row + 0.5) * texel;
    crossings.length = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!;
      const b = polygon[j]!;
      if ((a.y > y) !== (b.y > y)) crossings.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
    crossings.sort((p, q) => p - q);
    // Columns whose centre lies left of crossing k have the crossings from k on to their right.
    let column = 0;
    const base = row * columns;
    for (let k = 0; k < crossings.length && column < columns; k++) {
      const end = firstColumnFrom(crossings[k]!, texel, columns);
      if ((crossings.length - k) % 2 === 1 && end > column) fill(base + column, base + end);
      column = Math.max(column, end);
    }
  }
}

/** The first column whose centre is not left of `x` (`x <= (column + 0.5) · texel`). */
function firstColumnFrom(x: number, texel: number, columns: number): number {
  let column = Math.max(0, Math.min(columns, Math.ceil(x / texel - 0.5)));
  // The division rounds: step to the exact boundary of the strict test `centre < x`.
  while (column > 0 && (column - 0.5) * texel >= x) column--;
  while (column < columns && (column + 0.5) * texel < x) column++;
  return column;
}

/** The texel of `raster` that holds `point`, or -1 off its grid. */
function texelOf(grid: AmbientGrid, point: Point): number {
  const column = Math.floor(point.x / grid.texel);
  const row = Math.floor(point.y / grid.texel);
  return column >= 0 && row >= 0 && column < grid.columns && row < grid.rows ? row * grid.columns + column : -1;
}

/** The light level the ambient light alone gives `point`: from the raster where it has one, the scene's elsewhere. */
export function ambientLevelOn(raster: AmbientRaster | null, light: AmbientLight, point: Point): LightLevel {
  const at = raster ? texelOf(raster.grid, point) : -1;
  return at < 0 ? ambientLevel(light) : LEVELS[raster!.levels[at]!]!;
}
