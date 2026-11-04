import { TFile, type App } from 'obsidian';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { getLoadedAtlasView, openMapInView } from '../../../plugin/atlasLeaves';
import { AssetService } from '../../../services/AssetService';
import { createScene, freeSceneName } from '../../../services/createScene';
import type { WorldMapChoice } from './libraryPictures';

/** Opens a scene in Atlas with the note pin tool in hand, so the GM can set the pins that lead into other scenes. */
async function openForPins(app: App, file: TFile): Promise<void> {
  await openMapInView(app, file);
  getLoadedAtlasView(app)?.getStore().getState().setActiveTool('note-pin');
}

/**
 * Makes a scene on the image of a world map that is a plain map, in the map's collection and named
 * after it, and makes that scene the campaign's world map: only a scene holds pins. Returns its file.
 */
async function makeScene(app: App, campaign: Campaign, service: CampaignService, mapId: string): Promise<TFile | null> {
  const assets = AssetService.getInstance(app);
  const map = await assets.getAssetById(mapId);
  if (map?.type !== 'map') return null;
  const { file, asset } = await createScene(app, assets, { name: freeSceneName(app, map.collection, map.name), collectionId: map.collection, background: map.mapFilePath });
  service.update(campaign.id, { worldMap: asset.id });
  return file;
}

/**
 * Opens the campaign's world map for placing pins: its scene, or, for a plain map, a scene made on
 * it first (which becomes the campaign's world map).
 */
export async function editWorldMap(app: App, campaign: Campaign, service: CampaignService, choice: WorldMapChoice): Promise<void> {
  const file = choice.kind === 'scene'
    ? (choice.scenePath === undefined ? null : app.vault.getAbstractFileByPath(choice.scenePath))
    : await makeScene(app, campaign, service, choice.id);
  if (file instanceof TFile) await openForPins(app, file);
}
