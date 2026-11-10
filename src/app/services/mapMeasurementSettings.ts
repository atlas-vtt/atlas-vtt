import { resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import { collectionConeAngle } from '../gameSystems/coneAngle';
import { collectionDifficultTerrain } from '../gameSystems/difficultTerrain';
import { rulesForMap, type RulesLookup } from '../gameSystems/mapRules';
import type { ViewAtlasState } from '../storeFactory';

/** Measurement settings for the map in `state`, read from the rules it plays by when it has any. */
export function mapMeasurementSettings(
  lookup: RulesLookup,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid'>,
): MeasurementSettings {
  const { settings } = rulesForMap(lookup, state.mapPath);
  if (!settings) return resolveMeasurementSettings(undefined, state.grid);
  const { gridDefaults, systemPresetId } = settings;
  return {
    ...resolveMeasurementSettings(gridDefaults, state.grid),
    coneAngle: collectionConeAngle(gridDefaults, systemPresetId),
    difficultTerrain: collectionDifficultTerrain(gridDefaults, systemPresetId),
  };
}
