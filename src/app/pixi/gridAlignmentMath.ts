/**
 * Grid Alignment Math
 *
 * Pure calculation utilities for the 4-quadrant grid alignment tool.
 * All functions are stateless and side-effect-free.
 */

import type { GridType } from '../grid/GridSystem';
import { isHexGridType } from '../grid/hexGeometry';
import { hexAlignmentCandidates, hexSizeFromEdge } from './hexAlignmentMath';
import { NO_STRETCH, sameStretch, type MapStretch } from '../grid/mapStretch';
import type { GridState } from '../types/gridTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlignmentPoint = { x: number; y: number };

export interface MeasurementPair {
  a: AlignmentPoint;
  b: AlignmentPoint;
}

export interface AlignmentResult {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** Grid type the result applies to; hex alignment may detect a different orientation than the current one. */
  gridType?: GridType;
  /** Largest disagreement (px) between the fitted lattice and the clicked points, when available. */
  maxResidual?: number;
  /** Share of the detected grid's edges that sit on a line of the map (0–1), when the result came from image auto-detection. */
  confidence?: number;
  /** How the map image must be drawn for this grid to fit it; size and offsets are in that stretched world. Unset draws the image as it is. */
  mapStretch?: MapStretch;
}

/** `grid` with an alignment written into it: its type, size and offsets, and the map's stretch that goes with them. */
export function gridAlignedTo(grid: GridState, result: AlignmentResult): GridState {
  const { mapStretch: _previous, ...rest } = grid;
  return {
    ...rest,
    ...(result.gridType ? { type: result.gridType } : {}),
    size: result.cellSize,
    offsetX: result.offsetX,
    offsetY: result.offsetY,
    ...(result.mapStretch && !sameStretch(result.mapStretch, NO_STRETCH) ? { mapStretch: result.mapStretch } : {}),
  };
}

export interface MapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_THRESHOLD = 0.1;
const QUADRANT_MARGIN = 0.1;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Average modular values using sin/cos decomposition.
 * Prevents wraparound error (e.g. offsets 1 and 69 with period 70 → ~0, not 35).
 */
export function circularMean(values: number[], period: number): number {
  if (values.length === 0) return 0;

  let sinSum = 0;
  let cosSum = 0;

  for (const v of values) {
    const angle = (v / period) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  const meanAngle = Math.atan2(sinSum / values.length, cosSum / values.length);
  let result = (meanAngle / (2 * Math.PI)) * period;
  if (result < 0) result += period;

  return result;
}

/**
 * Compute the cell size from a single measurement pair.
 * Uses dominant-axis distance when nearly axis-aligned (threshold 10%).
 */
export function cellSizeFromPair(pair: MeasurementPair): number {
  const dx = Math.abs(pair.b.x - pair.a.x);
  const dy = Math.abs(pair.b.y - pair.a.y);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return 0;

  if (dy < dx * AXIS_THRESHOLD) return dx;
  if (dx < dy * AXIS_THRESHOLD) return dy;
  return dist;
}

/**
 * Compute grid alignment from 1–4 measurement pairs.
 * - cellSize = average of all pair distances
 * - offsetX/Y = circular mean of (point % cellSize) for all points
 */
export function calculateFromMeasurements(pairs: MeasurementPair[]): AlignmentResult | null {
  if (pairs.length === 0) return null;

  const sizes = pairs.map(cellSizeFromPair);
  if (sizes.some(s => s === 0)) return null;

  const cellSize = sizes.reduce((sum, s) => sum + s, 0) / sizes.length;

  const allPoints = pairs.flatMap(p => [p.a, p.b]);
  const xMods = allPoints.map(p => {
    let mod = p.x % cellSize;
    if (mod < 0) mod += cellSize;
    return mod;
  });
  const yMods = allPoints.map(p => {
    let mod = p.y % cellSize;
    if (mod < 0) mod += cellSize;
    return mod;
  });

  const offsetX = circularMean(xMods, cellSize);
  const offsetY = circularMean(yMods, cellSize);

  return {
    cellSize: Math.round(cellSize * 100) / 100,
    offsetX: Math.round(offsetX * 100) / 100,
    offsetY: Math.round(offsetY * 100) / 100,
  };
}

/** Cell size implied by one measurement for the given grid type. */
export function measurementCellSize(pair: MeasurementPair, gridType: GridType): number {
  return isHexGridType(gridType) ? hexSizeFromEdge(pair) : cellSizeFromPair(pair);
}

/**
 * Every grid the measurements can stand for, the likeliest first. Square grids measure adjacent
 * intersections and have one reading; hex grids measure two corners of a hex, which can be read
 * in several ways (`hexAlignmentCandidates`).
 */
export function alignmentCandidates(pairs: MeasurementPair[], gridType: GridType): AlignmentResult[] {
  if (isHexGridType(gridType)) return hexAlignmentCandidates(pairs, gridType);
  const result = calculateFromMeasurements(pairs);
  return result ? [{ ...result, gridType: 'square' }] : [];
}

/**
 * Returns the sub-rectangle for a quadrant.
 * Layout: 0=TL, 1=TR, 2=BL, 3=BR.
 */
export function getQuadrantBounds(mapBounds: MapBounds, index: 0 | 1 | 2 | 3): MapBounds {
  const halfW = mapBounds.width / 2;
  const halfH = mapBounds.height / 2;
  const col = index % 2;
  const row = Math.floor(index / 2);

  return {
    x: mapBounds.x + col * halfW,
    y: mapBounds.y + row * halfH,
    width: halfW,
    height: halfH,
  };
}

/**
 * Validates a click is within the active quadrant.
 * Adds ~10% margin tolerance at quadrant edges so near-boundary clicks aren't rejected.
 */
export function isPointInQuadrant(
  point: AlignmentPoint,
  quadrant: 0 | 1 | 2 | 3,
  mapBounds: MapBounds,
): boolean {
  const qb = getQuadrantBounds(mapBounds, quadrant);
  const marginX = qb.width * QUADRANT_MARGIN;
  const marginY = qb.height * QUADRANT_MARGIN;

  return (
    point.x >= qb.x - marginX &&
    point.x <= qb.x + qb.width + marginX &&
    point.y >= qb.y - marginY &&
    point.y <= qb.y + qb.height + marginY
  );
}
