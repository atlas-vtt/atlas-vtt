import type { App } from 'obsidian';
import { AssetService, type TokenAsset } from '../services/AssetService';
import { characterOfNote } from './playerCharacters';

/**
 * The player character whose statblock is the note at `notePath`, read from the asset index as it
 * is in memory: every player character linking the note is one character, named by the first of
 * them made (`characterOfNote`). Null where no player character links the note, or the index is not read yet.
 */
export function playerCharacterOfNote(app: App, notePath: string): TokenAsset | null {
  return characterOfNote(AssetService.getInstance(app).loadedTokenAssets(), notePath);
}
