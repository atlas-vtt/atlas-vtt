import type { MeasurementSettings } from '../grid/measurementFormat';
import type { GridState } from '../types/gridTypes';

/** How many game units one grid cell spans, and how many world pixels it is wide. */
export interface UnitScale {
  unitDistance: number;
  cellSize: number;
}

const FALLBACK: UnitScale = { unitDistance: 5, cellSize: 70 };

export function unitScaleOf(
  measurement: Pick<MeasurementSettings, 'unitDistance'> | null,
  grid: Pick<GridState, 'size'> | null,
): UnitScale {
  const unitDistance = measurement && measurement.unitDistance > 0 ? measurement.unitDistance : FALLBACK.unitDistance;
  const cellSize = grid && grid.size > 0 ? grid.size : FALLBACK.cellSize;
  return { unitDistance, cellSize };
}

export function gameUnitsToWorld(units: number, scale: UnitScale): number {
  return (units / scale.unitDistance) * scale.cellSize;
}

export function worldToGameUnits(world: number, scale: UnitScale): number {
  return (world / scale.cellSize) * scale.unitDistance;
}
