import { resolveMeasurementSettings, type MeasurementSettings } from '../../grid/measurementFormat';
import { levelObjects } from '../../levels/levelObjects';
import { difficultCells } from '../../mapFeatures/featureIndex';
import { mapFeatureList } from '../../mapFeatures/mapFeatures';
import { movedGameUnits } from '../../measure/dragMovement';
import { mapTokens } from '../../tokens/offMap';
import { dragPathCells } from '../marks/index.ts';
import type { Point } from '../movement/index.ts';
import { playerRulerPath } from './dragRulers.ts';
import type { SceneState } from './atlasView.ts';

type TurnMoveState = Pick<SceneState, 'objects' | 'grid' | 'levels' | 'viewedLevel'>;

/**
 * How far a player's drop moved their token, in the map's game units, as the drag ruler players and
 * the GM see measured it: from where the token stood to where it was put down, snapped, priced by the
 * map's diagonal and difficult terrain rules (`dragPathCells`). Null where it moved nothing measurable.
 */
export function playerMoveDistance(state: TurnMoveState, measurement: MeasurementSettings | null, tokenId: string, from: Point, to: Point): number | null {
  const token = mapTokens(levelObjects(state))[tokenId];
  if (token === undefined || state.grid === null) return null;
  const path = playerRulerPath(state, token, from, to);
  if (path === null) return null;
  const settings = measurement ?? resolveMeasurementSettings(undefined, state.grid);
  const difficult = difficultCells(mapFeatureList(levelObjects(state).mapFeatures));
  const cells = dragPathCells({ grid: state.grid, measurement: settings, difficult }, path, token.size || 1, state.grid.snapToGrid ?? true);
  return movedGameUnits(cells, settings);
}
