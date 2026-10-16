import { useMemo } from 'react';
import { TFile } from 'obsidian';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useOptionalAtlasStore } from '../../ViewStoreContext';
import type { DiceRollResult } from '../../../types/diceTypes';
import { AssetService, type TokenAsset } from '../../../services/AssetService';
import { TokenStatblockLinkService } from '../../../services/TokenStatblockLinkService';
import { imageSrc } from '../../../utils/imageSource';
import type { DiceAvatar, RollSourcePresentation } from './diceSourcePresentation';

/**
 * Resolves the avatar for a roll at render time rather than storing a URL with
 * the roll: resource URLs do not survive a restart, and a token may have been
 * given new artwork since. The map token's current image wins, then the library
 * token linked to the statblock (the one the roll recorded, where several are),
 * then the token image recorded with the roll, then the statblock's own art. The
 * ring follows the map token, so the avatar matches the canvas; without one it
 * follows the library token drawn with that artwork, and any other image (a
 * statblock's raw art) is shown unframed.
 *
 * A roll shown with a `presentation` (the player window's) has exactly its portrait, or
 * none: nothing is looked up for it.
 */
export function useDiceAvatar(source: DiceRollResult['source'], presentation?: RollSourcePresentation | null): DiceAvatar | null {
  const { app } = useAtlasUI();
  const lookup = presentation === undefined ? source : undefined;
  const tokenId = lookup?.tokenId;
  // One selector per field: selecting the token itself would re-render on every move.
  // Outside a map view, and for a token the store does not hold, avatars come from the statblock or the roll.
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
  const assets = AssetService.getInstance(app);
  const linkedToken = lookup?.statblockPath ? linkedLibraryToken(assets, lookup.statblockPath, lookup.tokenImagePath) : null;
  const statblockFile = lookup?.statblockPath
    ? app.vault.getAbstractFileByPath(lookup.statblockPath)
    : null;
  const statblockImagePath =
    statblockFile instanceof TFile
      ? TokenStatblockLinkService.getInstance(app).readStatblockImage(statblockFile)
      : null;
  const imagePath = currentImagePath ?? linkedToken?.imagePath ?? lookup?.tokenImagePath ?? statblockImagePath;
  // Web art shows from its address; a vault path shows only while the file is there.
  const src = imageSrc(app, imagePath);
  const showRing = currentImagePath !== undefined
    ? mapShowRing !== false
    : libraryTokenShowsRing(assets, src ? imagePath ?? null : null);

  const found = useMemo((): DiceAvatar | null => (
    src ? { src, showRing, ringColor } : null
  ), [src, showRing, ringColor]);
  return presentation === undefined ? found : presentation?.avatar ?? null;
}

/** The library token linked to a statblock: the one with the roll's recorded image where several are, else the first. */
function linkedLibraryToken(assets: AssetService, statblockPath: string, recordedImagePath: string | undefined): TokenAsset | null {
  const linked = assets.loadedTokenAssets().filter((asset) => asset.statblockPath === statblockPath);
  return linked.find((asset) => asset.imagePath === recordedImagePath) ?? linked[0] ?? null;
}

function libraryTokenShowsRing(assets: AssetService, imagePath: string | null): boolean {
  if (!imagePath) return false;
  const asset = assets.findTokenAssetByImagePath(imagePath);
  return asset ? asset.showRing !== false : false;
}
