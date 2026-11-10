import type { App } from 'obsidian';
import { rulesOfPreset, vanillaSystemSettings } from '../gameSystems/systemRules';
import type { SystemPreset } from '../types/systemPresetTypes';
import { AssetService, type CollectionMetadata } from './AssetService';
import { syncCollectionSystem } from './collectionSystemSync';

/**
 * Creates a collection that plays `preset`'s game system: its measurement,
 * conditions and resource bars, and the widgets it adds (e.g. Shadowdark's
 * torch timer). Its senses, lights, initiative rules and statblock roles are
 * read from the preset (`collectionStatblockRoles`), so a later correction of
 * the preset reaches it. Without a preset the collection starts with no game
 * system: HP as its only resource and the generic roles.
 */
export async function createCollectionWithSystem(
  app: App,
  name: string,
  preset: SystemPreset | undefined,
  presets: readonly SystemPreset[],
): Promise<CollectionMetadata> {
  const assets = AssetService.getInstance(app);
  const collection = await assets.createCollection(name);
  if (!preset) {
    await assets.updateCollectionSettings(collection.id, vanillaSystemSettings());
    return collection;
  }
  await assets.updateCollectionSettings(collection.id, { ...rulesOfPreset(preset), systemPresetId: preset.id });
  await syncCollectionSystem(app, collection.id, presets);
  return collection;
}
