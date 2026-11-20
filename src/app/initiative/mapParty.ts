import type { App } from 'obsidian';
import { AssetService } from '../services/AssetService';
import type { PartyMember } from '../types/collectionSettingsTypes';
import { collectionParty } from './party';
import { collectionEnemyImage } from './tokenlessEnemies';

/**
 * The party of the collection that holds the map; none outside every collection. It is the
 * collection's own, never a campaign system's rule, so it is read from the collection directly.
 * Apart from `party.ts`, which stays free of the asset index (online play reads it).
 */
export function mapParty(app: App, mapPath: string | null | undefined): PartyMember[] {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  return collectionParty(collectionId ? assets.getCollectionSettings(collectionId) : null);
}

/** The picture of an enemy added by name on this map, or none where the collection names no picture or its file is gone. */
export function mapEnemyImage(app: App, mapPath: string | null | undefined): string {
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  const image = collectionEnemyImage(collectionId ? assets.getCollectionSettings(collectionId) : null);
  return image && app.vault.getFileByPath(image) ? image : '';
}
