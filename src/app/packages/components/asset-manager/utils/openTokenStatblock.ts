import type { App } from 'obsidian';
import type { TokenAsset } from '../types';
import { openStatblockNote } from '../../../../statblocks/editor/create/entryPoints';

export interface TokenStatblockOpening {
  /** The note is gone: the dialog to link another opens instead. */
  onMissing: (asset: TokenAsset) => void;
  /** The note opened beside its statblock, in the workspace the asset manager covers. */
  onEditorOpened?: (() => void) | undefined;
}

/** Opens a token's statblock note (its card's badge, its menu); a note that is gone opens the link dialog. */
export function openTokenStatblock(app: App, asset: TokenAsset, opening: TokenStatblockOpening): void {
  if (!asset.statblockPath) return;
  // The pane takes the collection from the tokens that link the note (§7.1).
  const opened = openStatblockNote(app, asset.statblockPath, { collectionId: null, from: 'asset-manager' });
  if (opened === 'missing') opening.onMissing(asset);
  else if (opened === 'editor') opening.onEditorOpened?.();
}
