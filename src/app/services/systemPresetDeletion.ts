import type { App } from 'obsidian';
import { CampaignFiles, type CampaignStorage } from '../campaigns/CampaignFiles';
import { CampaignService } from '../campaigns/CampaignService';
import { vanillaSystemSettings } from '../gameSystems/systemRules';
import { AssetService } from './AssetService';
import { syncCollectionSystem } from './collectionSystemSync';
import type { SystemPresetService } from './SystemPresetService';

/**
 * Deletes a user preset. Every collection that used it goes back to having no
 * game system (default measurement, no conditions, no default widgets), and
 * loses the preset's conditions on its tokens, the widgets the preset added
 * and the resource bars it turned on. Every campaign that used it loses its
 * system, so its maps play by their collections' rules again; one a newer
 * Atlas wrote is left as it is.
 * Returns the ids of those collections.
 */
export async function deleteSystemPreset(
  app: App,
  presets: SystemPresetService,
  presetId: string,
  campaigns: CampaignStorage | undefined = CampaignFiles.forApp(app),
): Promise<string[]> {
  // Still lists the deleted preset, so its widgets are recognised and removed.
  const known = presets.list();
  presets.delete(presetId);
  if (campaigns) clearCampaignSystems(new CampaignService(campaigns), presetId);
  const assets = AssetService.getInstance(app);
  const affected = (await assets.getCollections())
    .filter((collection) => collection.settings?.systemPresetId === presetId);

  for (const collection of affected) {
    const vanilla = vanillaSystemSettings();
    await assets.updateCollectionSettings(collection.id, vanilla);
    await syncCollectionSystem(app, collection.id, known);
  }
  return affected.map((collection) => collection.id);
}

function clearCampaignSystems(service: CampaignService, presetId: string): void {
  for (const campaign of service.list()) {
    if (campaign.readOnly !== true && campaign.system?.systemPresetId === presetId) service.update(campaign.id, { system: undefined });
  }
}
