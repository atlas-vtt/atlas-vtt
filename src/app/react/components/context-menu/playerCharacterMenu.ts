import type { App } from 'obsidian';
import type { ContextMenuEntry } from './AtlasContextMenu';
import type { AssetService } from '../../../services/AssetService';
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

/** "Make player character" or "No longer a player character", in the asset manager. */
export function playerCharacterEntry(isOn: boolean, onToggle: (on: boolean) => void): ContextMenuEntry {
  return {
    type: 'item',
    label: isOn ? t('token.noLongerPlayerCharacter') : t('token.makePlayerCharacter'),
    icon: isOn ? 'user-x' : 'user-check',
    onClick: () => onToggle(!isOn),
  };
}
