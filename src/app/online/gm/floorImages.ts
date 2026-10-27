import { MAX_ASSET_BYTES, type AssetRef } from '../protocol/index.ts';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import type { PictureImage } from './assetAnswers.ts';
import { sha256Hex } from './assetServe.ts';
import type { MapSize } from './moveCheck.ts';
import type { VaultImage } from './TokenShare.ts';

/** A map image as read for sharing: its reference and bytes. */
export type SharedImage = PictureImage & { readonly ref: AssetRef };

/** What a floor's image was read as: the map with its size. */
export interface FloorImages {
  readonly map: SharedImage | null;
  readonly size: MapSize | null;
}

/** An image of the vault as players may be sent it, or null for one that is missing or too large. */
async function sharedImage(readImage: (path: string) => Promise<VaultImage | null>, path: string): Promise<SharedImage | null> {
  const image = await readImage(path);
  if (image === null || image.bytes.length > MAX_ASSET_BYTES) return null;
  const hash = await sha256Hex(image.bytes);
  return { hash, bytes: image.bytes, mime: image.mime, ref: { hash, size: image.bytes.length, mime: image.mime } };
}

/** A floor's map (`background`, none for a floor without one) with its size; null where the map cannot be sent. */
export async function readFloorImages(readImage: (path: string) => Promise<VaultImage | null>, background: string | null): Promise<FloorImages | null> {
  if (background === null) return { map: null, size: null };
  const map = await sharedImage(readImage, background);
  if (map === null) return null;
  const size = await imageDimensions(new Blob([map.bytes]));
  return { map, size };
}
