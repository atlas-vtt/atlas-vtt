import { ASSET_CAPS, type AssetRef } from '../protocol/index.ts';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import { isVideoMapPath } from '../../pixi/mosaicCanvas/video/videoMapFiles';
import { ASSET_USES, type AssetStoring } from './assets/assetUses.ts';
import type { MapSize } from './moveCheck.ts';
import type { VaultImage } from './TokenShare.ts';

/**
 * What a floor's image was read as: the map players are handed (null where the store does not keep it
 * for them), its size, and whether it is too large to be stored as one image where no pyramid of it is.
 */
export interface FloorImages {
  readonly map: AssetRef | null;
  readonly size: MapSize | null;
  readonly tooLarge: boolean;
}

/**
 * A floor's map (`background`, none for a floor without one): as its tile pyramid where the store keeps
 * one, else as the image where the store keeps it (within its cap for images), with its size; null
 * where it cannot be read. A poster is drawn from its video, so it is kept rather than read again for
 * the upload.
 */
export async function readFloorImages(readImage: (path: string) => Promise<VaultImage | null>, background: string | null, stored?: AssetStoring): Promise<FloorImages | null> {
  if (background === null) return { map: null, size: null, tooLarge: false };
  const image = await readImage(background);
  if (image === null) return null;
  const map = stored === undefined ? null : isVideoMapPath(background) ? await stored.refOf(image.bytes, image.mime, { ...ASSET_USES.map, map: background }) : await stored.mapRef(image.bytes, image.mime, background);
  const size = await imageDimensions(new Blob([image.bytes]));
  return { map, size, tooLarge: map === null && image.bytes.length > ASSET_CAPS.image };
}
