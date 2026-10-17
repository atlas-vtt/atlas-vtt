/**
 * What a finished fog edit uncovered or covered, and the cloud puffs animated
 * over it. Pure: the caller rasterises the fog masks, so this runs in tests
 * without a canvas.
 */
import type { FogBounds } from '../../types/fogTypes';

/** A fog mask sampled on a grid: one alpha value (0-255) per cell, row by row. */
export interface FogMask {
  alpha: ArrayLike<number>;
  columns: number;
  rows: number;
}

export interface FogArea {
  /** World-space centres of the cells in the area. */
  points: Array<{ x: number; y: number }>;
  /** World-space edge length of one cell. */
  cellSize: number;
}

export interface FogChange {
  /** Fogged before the edit, clear after it. */
  revealed: FogArea;
  /** Clear before the edit, fogged after it. */
  covered: FogArea;
}

/** `part`: clouds drift apart off a revealed area. `gather`: clouds drift in over a covered one. */
export type PuffMotion = 'part' | 'gather';

export interface FogPuff {
  motion: PuffMotion;
  /** Where the puff rests: its start when parting, its end when gathering. */
  x: number;
  y: number;
  radius: number;
  /** World-space offset from the resting point to the far end of its path. */
  dx: number;
  dy: number;
  /** Share of the animation (0-1) that passes before this puff starts moving. */
  delay: number;
  spin: number;
  /** Index into the cloud tones of the fog colour. */
  tone: number;
}

/** A cell counts as fogged from half opacity on, the edge of an antialiased shape. */
const FOGGED_ALPHA = 128;
/** Samples per axis at most; enough to place puffs, cheap to read back once per edit. */
const MAX_CELLS = 60_000;
/** Puffs per animated area at most. */
export const MAX_PUFFS = 120;
const MIN_PUFFS = 8;
/** Changed world area per puff before the cap applies. */
const AREA_PER_PUFF = 6_000;
const PUFF_TONES = 3;

/** Edge length of a sampling cell for `bounds`, so a mask never exceeds `MAX_CELLS`. */
export function revealCellSize(bounds: FogBounds): number {
  return Math.max(8, Math.ceil(Math.sqrt((bounds.width * bounds.height) / MAX_CELLS)));
}

/** Cells whose fog an edit removed or added; both masks sample `bounds` with `cellSize`. */
export function findFogChange(before: FogMask, after: FogMask, bounds: FogBounds, cellSize: number): FogChange {
  const revealed: FogArea = { points: [], cellSize };
  const covered: FogArea = { points: [], cellSize };
  for (let row = 0; row < before.rows; row++) {
    for (let column = 0; column < before.columns; column++) {
      const index = row * before.columns + column;
      const was = (before.alpha[index] ?? 0) >= FOGGED_ALPHA;
      const is = (after.alpha[index] ?? 0) >= FOGGED_ALPHA;
      if (was === is) continue;
      const point = { x: bounds.x + (column + 0.5) * cellSize, y: bounds.y + (row + 0.5) * cellSize };
      (was ? revealed : covered).points.push(point);
    }
  }
  return { revealed, covered };
}

/**
 * Puffs over `area` moving like a curtain: the ones left of its middle travel
 * the left end of their path, the others the right end, with a little vertical
 * wander. Parting puffs start on the area and leave; gathering ones arrive.
 */
export function layoutPuffs(area: FogArea, motion: PuffMotion, random: () => number = Math.random): FogPuff[] {
  const { points, cellSize } = area;
  if (points.length === 0) return [];
  const changed = points.length * cellSize * cellSize;
  const count = Math.min(MAX_PUFFS, Math.max(MIN_PUFFS, Math.round(changed / AREA_PER_PUFF)));
  const spacing = Math.sqrt(changed / count);
  const radius = Math.max(cellSize, spacing * 1.1);
  const middle = points.reduce((sum, point) => sum + point.x, 0) / points.length;

  const pool = points.slice();
  const puffs: FogPuff[] = [];
  while (puffs.length < count && pool.length > 0) {
    const [point] = pool.splice(Math.floor(random() * pool.length), 1);
    if (!point) break;
    const fromMiddle = point.x - middle;
    const side = Math.abs(fromMiddle) < cellSize ? (random() < 0.5 ? -1 : 1) : Math.sign(fromMiddle);
    const size = radius * (0.85 + random() * 0.4);
    const distance = size * (1.4 + random() * 1.2) + Math.abs(fromMiddle) * 0.3;
    puffs.push({
      motion,
      x: point.x + (random() - 0.5) * spacing * 0.5,
      y: point.y + (random() - 0.5) * spacing * 0.5,
      radius: size,
      dx: side * distance,
      dy: (random() - 0.5) * 0.5 * distance,
      delay: random() * 0.15,
      spin: (random() - 0.5) * 2,
      tone: Math.floor(random() * PUFF_TONES),
    });
  }
  return puffs;
}
