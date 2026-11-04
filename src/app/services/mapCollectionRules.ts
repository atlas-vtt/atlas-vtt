import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../gameSystems/lightPresets/generic';
import { readCollectionLightPresets } from '../gameSystems/lightPresetValidation';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import { unitScaleOf } from '../lighting/lightingUnits';
import { lightPresetsOnMap } from '../lighting/lightPresetChoice';
import { maxLightRange } from '../lighting/lightRanges';
import type { ViewAtlasState } from '../storeFactory';
import type { LightPresetDefinition } from '../types/lightPresetTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { mapRules } from './mapRules';
import { SystemPresetService } from './SystemPresetService';
import { SystemPresetFiles } from './systemPresets/SystemPresetFiles';

/** The game system presets of the vault: the built-in ones, and the user's once their files are open. */
export function systemPresetsOf(app: App): readonly SystemPreset[] {
  const files = SystemPresetFiles.forApp(app);
  return files ? new SystemPresetService(files).list() : BUILT_IN_SYSTEM_PRESETS;
}

/**
 * The lights offered on the map in `state`: those of the rules it plays by, or the generic ones
 * without any, in what the map measures in and no farther than a light may reach on it
 * (`lightPresetsOnMap`).
 */
export function mapLightPresets(app: App, state: Pick<ViewAtlasState, 'mapPath' | 'grid'>): readonly LightPresetDefinition[] {
  const { settings } = mapRules(app, state.mapPath);
  const presets = settings ? readCollectionLightPresets(settings, systemPresetsOf(app)) : GENERIC_LIGHT_PRESETS;
  const unit = resolveMeasurementSettings(settings?.gridDefaults, state.grid);
  return lightPresetsOnMap(presets, unit, maxLightRange(unitScaleOf(unit, state.grid)));
}
