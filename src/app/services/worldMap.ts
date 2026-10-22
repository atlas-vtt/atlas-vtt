import type { App } from 'obsidian';
import type { CampaignService } from '../campaigns/CampaignService';
import { AssetService, type Asset } from './AssetService';
import { coverCandidates } from './collectionBundle/collectionCover';
import { sceneThumbnailPath } from './collectionBundle/collectionReferences';

/**
 * The artwork of a map or scene that can be a world map: the map's image, or the background a
 * scene's file shows. A scene without one has none: its thumbnail is a small picture Atlas makes anew.
 */
export async function worldMapArtwork(app: App, asset: Asset): Promise<string | null> {
  const thumbnail = asset.type === 'scene' && asset.data?.mapPath ? sceneThumbnailPath(asset.data.mapPath) : null;
  const [candidate] = await coverCandidates(app, [asset]);
  return candidate === undefined || candidate.sourcePath === thumbnail ? null : candidate.sourcePath;
}

/**
 * The image a campaign shows as its world map, or null. Campaign files are no proof (a sync tool or
 * a hand edit may have written them), and this image is shown to others. So the campaign's world map
 * must be a map or scene of Atlas's asset index, and the image must be its artwork: the image that
 * map or scene shows, wherever in the vault it lies, as presenting the scene sends it to players too
 * (Atlas follows the image when it is moved out of its folders).
 */
export async function campaignWorldMap(app: App, campaigns: CampaignService, campaignId: string | null): Promise<string | null> {
  const assetId = campaignId === null ? undefined : campaigns.get(campaignId)?.worldMap;
  if (assetId === undefined) return null;
  const asset = await AssetService.getInstance(app).getAssetById(assetId);
  if (asset?.id !== assetId || (asset.type !== 'map' && asset.type !== 'scene')) return null;
  return worldMapArtwork(app, asset);
}
