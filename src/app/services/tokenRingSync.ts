/**
 * A token's ring, switched from outside a map (the statblock's token panel):
 * its asset record, every placed token drawn with its art on an open map,
 * and those in the map files no view holds, so the map, the asset card, the
 * initiative lists and the statblock all show the same ring. An open map takes
 * the change untracked: an edit made beside a note is no undo step of a map.
 */

import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import { tokenFromFile, tokenToFile } from '../resources/resourceFileFormat';
import { runUntracked } from '../stores/history';
import type { ViewAtlasStore } from '../storeFactory';
import type { TokenUpdates } from '../types/viewState';
import { AssetService, type TokenAsset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';

interface StoredRing {
  imagePath?: string;
  showRing?: boolean;
}

/** The game master's map stores of the open views; a player view mirrors one of them. */
function openMapStores(app: App): ViewAtlasStore[] {
  return app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE).flatMap((leaf) => {
    const store = (leaf.view as unknown as { getStore?: () => ViewAtlasStore }).getStore?.();
    return store && !store.getState().isPlayerView ? [store] : [];
  });
}

/** The map file with every token of `imagePath` given the ring; null when none of them changes. */
export function mapWithRing(content: string, imagePath: string, showRing: boolean): string | null {
  const data: unknown = JSON.parse(content);
  if (!isPersistedMapEnvelope(data)) return null;
  const tokens = data.state?.objects?.tokens as Record<string, StoredRing> | undefined;
  if (!tokens) return null;
  let changed = false;
  for (const [id, stored] of Object.entries(tokens)) {
    if (stored.imagePath !== imagePath || (stored.showRing !== false) === showRing) continue;
    tokens[id] = tokenToFile({ ...tokenFromFile(stored), showRing });
    changed = true;
  }
  return changed ? JSON.stringify(data, null, 2) : null;
}

/** Gives the token asset, and every token placed with its art, the ring or none. */
export async function setTokenRing(app: App, asset: Pick<TokenAsset, 'id' | 'imagePath'>, showRing: boolean): Promise<void> {
  await AssetService.getInstance(app).updateAsset(asset.id, { showRing });

  const open = new Set<string>();
  for (const store of openMapStores(app)) {
    const state = store.getState();
    if (state.mapPath) open.add(state.mapPath);
    const entries = Object.values(state.objects.tokens)
      .filter((token) => token.imagePath === asset.imagePath && (token.showRing !== false) !== showRing)
      .map((token): { id: string; changes: TokenUpdates } => ({ id: token.id, changes: { showRing } }));
    if (entries.length) runUntracked(store, () => state.updateTokens(entries));
  }

  for (const file of app.vault.getFiles()) {
    if (file.extension !== 'atlasmap' || open.has(file.path)) continue;
    try {
      if (mapWithRing(await app.vault.read(file), asset.imagePath, showRing) === null) continue;
      await app.vault.process(file, (latest) => mapWithRing(latest, asset.imagePath, showRing) ?? latest);
    } catch (error) {
      console.error(`[Atlas] Could not set the token ring in ${file.path}:`, error);
    }
  }
  app.workspace.trigger('atlas-vtt:refresh-assets');
}
