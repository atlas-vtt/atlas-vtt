import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { rulesForMap, type RulesLookup } from '../gameSystems/mapRules';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { HP_RESOURCE, withLegacyBars } from './resourceDefinitions';
import { MAX_RESOURCES, type ResourceDefinition } from './resourceTypes';

/**
 * The resources of a collection. One saved before resources existed reads as its
 * preset's with the secondary bar its default widgets switched on, until
 * `storeLegacyResources` has looked at its scenes and stored the list.
 */
export function collectionResources(
  settings: Pick<CollectionSettings, 'resources' | 'defaultWidgets' | 'systemPresetId'>,
): ResourceDefinition[] {
  // Capped here too: settings can arrive without passing the index's parser (an import in this session)
  return (settings.resources ?? legacyCollectionResources(settings, BUILT_IN_SYSTEM_PRESETS)).slice(0, MAX_RESOURCES);
}

/**
 * Definitions for a collection saved before resources existed: its recorded
 * preset's (HP without one), with the secondary bar the collection's own default
 * widgets switched on or off, or one of its scenes shows (`usedInScenes`).
 */
export function legacyCollectionResources(
  settings: Pick<CollectionSettings, 'defaultWidgets' | 'systemPresetId'>,
  presets: readonly SystemPreset[],
  usedInScenes = false,
): ResourceDefinition[] {
  const preset = presets.find((p) => p.id === settings.systemPresetId);
  const resources = preset?.rules.resources ? structuredClone(preset.rules.resources) : [{ ...HP_RESOURCE }];
  return withLegacyBars(resources, settings.defaultWidgets, usedInScenes);
}

/**
 * The resources tokens on a map track: those of its rules (the played campaign's system, else its
 * collection's). A map outside every collection keeps the two bars every map had, each shown by the
 * map's own switch. A map in a collection the index does not know (yet) tracks HP.
 */
export function mapResources(lookup: RulesLookup, mapPath: string | null | undefined): ResourceDefinition[] {
  const { source, settings } = rulesForMap(lookup, mapPath);
  if (settings) return collectionResources(settings);
  const outsideCollections = source.kind === 'none' && source.outsideCollections;
  return outsideCollections ? withLegacyBars([{ ...HP_RESOURCE }], undefined, true) : [{ ...HP_RESOURCE }];
}
