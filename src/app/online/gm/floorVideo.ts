import { VIDEO_MIME_TYPES, type AssetRef } from '../protocol/index.ts';
import { ASSET_USES, type AssetStoring } from './assets/assetUses.ts';

/** An animated map's video as shared: its reference, and where it lies. */
export interface SharedVideo {
  readonly ref: AssetRef;
  readonly path: string;
}

/**
 * The video of a floor's map (`background`) players may play in its poster's place, by the id the
 * store keeps it under (up to the store's cap for videos; the file is read only to hash it once per
 * version); null for a map that is no video, or one the store does not keep: players keep the poster.
 */
export async function readFloorVideo(stored: AssetStoring | undefined, background: string | null, mimeOf: (path: string) => string | null): Promise<SharedVideo | null> {
  if (background === null || stored === undefined) return null;
  const mime = mimeOf(background);
  if (mime === null || !VIDEO_MIME_TYPES.includes(mime)) return null;
  const ref = await stored.fileRef(background, mime, ASSET_USES.video).catch(() => null);
  return ref === null ? null : { ref, path: background };
}
