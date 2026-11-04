import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../../storeFactory';
import type { ContextMenuEntry } from './AtlasContextMenu';
import { AssetService } from '../../../services/AssetService';
import { isPlayerCharacter, libraryTokenOf, type PlacedTokenSource } from '../../../characters/playerCharacters';
import { playerVisionChanges } from '../../../characters/playerVision';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';

/**
 * Marks library tokens as player characters or no longer, and tells every list of them.
 * The change is the library's, not a scene's, so it is no undo step.
 */
export async function setPlayerCharacters(app: App, assets: AssetService, ids: readonly string[], on: boolean): Promise<void> {
  try {
    await assets.setPlayerCharacters(ids, on);
  } finally {
    // A save that failed part way may still have changed the index the lists show.
    app.workspace.trigger('atlas-vtt:refresh-assets');
  }
}

/** "Make player character" or "No longer a player character", shared by the map token menu and the asset manager. */
export function playerCharacterEntry(isOn: boolean, onToggle: (on: boolean) => void): ContextMenuEntry {
  return {
    type: 'item',
    label: isOn ? t('token.noLongerPlayerCharacter') : t('token.makePlayerCharacter'),
    icon: isOn ? 'user-x' : 'user-check',
    onClick: () => onToggle(!isOn),
  };
}

/**
 * The entry for a token on the map, for the library token it was placed from; null when no library
 * token is known for it. Making it a player character also switches on the vision of its tokens on
 * this map (`playerVision`), one undo step; the library change is none.
 */
export function placedPlayerCharacterEntry(app: App, token: PlacedTokenSource, store: StoreApi<ViewAtlasState>): ContextMenuEntry | null {
  const assets = AssetService.getInstance(app);
  const library = assets.loadedTokenAssets();
  const asset = libraryTokenOf(token, library);
  if (!asset) return null;
  return playerCharacterEntry(isPlayerCharacter(asset), (on) => {
    if (on) {
      const { objects, updateTokens } = store.getState();
      const placed = Object.values(objects.tokens).filter((entry) => libraryTokenOf(entry, library)?.id === asset.id);
      const changes = playerVisionChanges(objects.tokens, placed.map((entry) => entry.id));
      if (changes.length > 0) updateTokens(changes);
    }
    runInBackground(
      setPlayerCharacters(app, assets, [asset.id], on),
      `Marking token ${asset.id} as a player character`,
      t('token.playerCharacterFailed'),
    );
  });
}
