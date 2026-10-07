import type { App } from 'obsidian';
import { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';

/** The dice look a collection chose for its maps (`dice.useLook`); undefined when it follows the GM's. */
export function collectionDiceLookId(app: App, collectionId: string | null): string | undefined {
  if (collectionId === null) return undefined;
  try {
    return AssetService.getInstance(app).peekCollectionIndexData(collectionId)?.diceLookId;
  } catch {
    return undefined;
  }
}

/**
 * The dice look rolls on the map `mapPath` throw in: its collection's choice, else the GM's (`''` for Atlas's
 * own). A map outside every collection follows the GM's.
 */
export function mapDiceLookId(app: App, mapPath: string | null): string {
  let collectionId: string | null = null;
  try {
    collectionId = mapPath ? AssetService.getInstance(app).getCollectionForMap(mapPath) : null;
  } catch {
    collectionId = null;
  }
  return collectionDiceLookId(app, collectionId) ?? SettingsService.forApp(app)?.getDiceLookId() ?? '';
}
