import type { App } from 'obsidian';
import type { SenseRules, SenseRulesSource } from '../creatures/tokenSensesResolver';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { parseUserPresets } from '../gameSystems/presetValidation';
import { collectionSenses } from '../gameSystems/senseRules';
import { GENERIC_SENSES } from '../gameSystems/senses';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import type { ViewAtlasState } from '../storeFactory';
import { rulesForMap, type CollectionLookup, type RulesSettings } from '../gameSystems/mapRules';
import type { SystemPreset } from '../types/systemPresetTypes';
import { onMapRulesChange, rulesLookup } from './mapRules';
import { SystemPresetFiles } from './systemPresets/SystemPresetFiles';

type MapState = Pick<ViewAtlasState, 'mapPath' | 'grid'>;

/**
 * The user's presets as last stored, validated once: the preset files hand out a new list on every
 * change, so a list seen before holds the same presets, and their senses keep their identity for
 * callers that compare by reference.
 */
const validated = new WeakMap<object, readonly SystemPreset[]>();

function userPresets(app: App): readonly SystemPreset[] {
  const stored = SystemPresetFiles.forApp(app)?.entries();
  if (!stored) return [];
  const known = validated.get(stored);
  if (known) return known;
  const presets = parseUserPresets(stored);
  validated.set(stored, presets);
  return presets;
}

/** The presets the rules' senses may come from; the user's are read only when they name one of them. */
function presetsFor(app: App, settings: RulesSettings): readonly SystemPreset[] {
  if (settings.senses || !settings.systemPresetId) return [];
  const builtIn = BUILT_IN_SYSTEM_PRESETS.some((preset) => preset.id === settings.systemPresetId);
  return builtIn ? BUILT_IN_SYSTEM_PRESETS : userPresets(app);
}

/**
 * What statblock senses are read with for the map in `state`: the senses of the rules it plays by
 * (`rulesForMap`, the map's collection looked up in `collections`) and what they measure in. A map
 * without rules has the generic senses and its own grid units. Cheap enough to call for every
 * token: the senses are the same list while the rules and the stored presets are unchanged.
 */
export function mapSenseRules(app: App, collections: CollectionLookup, state: MapState): SenseRules {
  const { settings } = rulesForMap(rulesLookup(app, collections), state.mapPath);
  return {
    definitions: settings ? collectionSenses(settings, presetsFor(app, settings)) : GENERIC_SENSES,
    unit: resolveMeasurementSettings(settings?.gridDefaults, state.grid),
  };
}

/**
 * The rules of the map a view shows, for `tokenSensesResolver`: read anew on every call, with a
 * subscription to what can change them (`onMapRulesChange`; the resolver tells whether the rules
 * differ).
 */
export function mapSenseRulesSource(app: App, collections: CollectionLookup, state: () => MapState): Required<SenseRulesSource> {
  return {
    get: () => mapSenseRules(app, collections, state()),
    subscribe: (listener) => onMapRulesChange(app, () => state().mapPath, listener, rulesLookup(app, collections)),
  };
}
