import type { MeasurementSettings } from '../../grid/measurementFormat';
import { toGameUnits } from '../../grid/statedDistance';
import type { DungeonView } from '../style';

/** How the collection a dungeon's scene is made for measures: its unit and what a square is in it. */
export type SceneUnit = Pick<MeasurementSettings, 'unitType' | 'ruleDistance'>;

/** A distance of `squares` grid squares in the collection's units. */
export function squaresToUnits(squares: number, unit: SceneUnit): number {
  return toGameUnits({ value: squares, unit: 'squares' }, { unitType: unit.unitType, ruleDistance: unit.ruleDistance });
}

/** A distance of `cells` cells of the drawn dungeon in the collection's units: a cell is two squares with small tiles. */
export function cellsToUnits(cells: number, view: Pick<DungeonView, 'smallTiles'>, unit: SceneUnit): number {
  return squaresToUnits(cells * (view.smallTiles ? 2 : 1), unit);
}
