import type { CollectionGridDefaults, DifficultTerrainRule } from '../types/collectionSettingsTypes';
import { BUILT_IN_SYSTEM_PRESETS } from './builtInPresets';

/**
 * What difficult terrain costs a collection's movement: its own rule, else that of its built-in
 * system (collections set up before the rule existed store none), else nothing extra.
 */
export function collectionDifficultTerrain(gridDefaults: CollectionGridDefaults | undefined, systemPresetId: string | undefined): DifficultTerrainRule {
  return gridDefaults?.difficultTerrain
    ?? BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === systemPresetId)?.rules.gridDefaults.difficultTerrain
    ?? 'none';
}
