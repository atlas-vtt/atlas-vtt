import { useMemo } from 'react';
import { TFile } from 'obsidian';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useOptionalAtlasStore } from '../../ViewStoreContext';
import type { DiceRollResult } from '../../../types/diceTypes';
import { AssetService } from '../../../services/AssetService';
import { TokenStatblockLinkService } from '../../../services/TokenStatblockLinkService';

export interface DiceAvatar {
  src: string;
  showRing: boolean;
  ringColor: string | undefined;
}

/**
 * Resolves the avatar for a roll at render time rather than storing a URL with
 * the roll: resource URLs do not survive a restart, and a token may have been
 * given new artwork since. The map token's current image wins, then the image
 * of the token currently linked to the statblock, then the path recorded with
 * the roll. The ring follows the map token, so the avatar matches the canvas;
 * without one it follows the library token drawn with that artwork, and any
 * other image is shown unframed.
 */
export function useDiceAvatar(source: DiceRollResult['source']): DiceAvatar | null {
  const { app } = useAtlasUI();
  const tokenId = source?.tokenId;
  // One selector per field: selecting the token itself would re-render on every move.
  // The player window reads the presented scene's store, lent to it. Without a store, and for
  // a token the store does not hold, avatars come from the statblock or the roll.
  const currentImagePath = useOptionalAtlasStore(
    (state): string | undefined => (tokenId ? state.objects?.tokens?.[tokenId]?.imagePath : undefined),
    undefined,
  );
  const mapShowRing = useOptionalAtlasStore(
    (state): boolean | undefined => (tokenId ? state.objects?.tokens?.[tokenId]?.showRing : undefined),
    undefined,
  );
  const ringColor = useOptionalAtlasStore(
    (state): string | undefined => (tokenId ? state.objects?.tokens?.[tokenId]?.ringColor : undefined),
    undefined,
  );
  // ponytail: read per render, so a re-link shows on the next re-render (the log
  // ticks every 10 s); subscribe to metadataCache 'changed' if that is too slow.
  const statblockFile = source?.statblockPath
    ? app.vault.getAbstractFileByPath(source.statblockPath)
    : null;
  const linkedImagePath =
    statblockFile instanceof TFile
      ? TokenStatblockLinkService.getInstance(app).readStatblockImage(statblockFile)
      : null;
  const imagePath = currentImagePath ?? linkedImagePath ?? source?.tokenImagePath;
  const file = imagePath ? app.vault.getAbstractFileByPath(imagePath) : null;
  const imageFile = file instanceof TFile ? file : null;
  const showRing = currentImagePath !== undefined
    ? mapShowRing !== false
    : libraryTokenShowsRing(AssetService.getInstance(app), imageFile);

  return useMemo((): DiceAvatar | null => (
    imageFile ? { src: app.vault.getResourcePath(imageFile), showRing, ringColor } : null
  ), [app, imageFile, showRing, ringColor]);
}

function libraryTokenShowsRing(assets: AssetService, imageFile: TFile | null): boolean {
  if (!imageFile) return false;
  const asset = assets.findTokenAssetByImagePath(imageFile.path);
  return asset ? asset.showRing !== false : false;
}
