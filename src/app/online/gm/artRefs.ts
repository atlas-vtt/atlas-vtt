import type { AssetRef } from '../protocol/index.ts';
import { ASSET_USES, type AssetStoring } from './assets/assetUses.ts';
import type { VaultImage } from './TokenShare.ts';

type ArtEntry = AssetRef | null | 'reading';

/**
 * Artwork by vault path as players are sent it: read and hashed once, in the background, by the id the
 * store keeps it under (`stored`); none where the store does not. A path asked for the first time is
 * null until it has been read; `read` hears when it has.
 */
export class ArtRefs {
  private readonly art = new Map<string, ArtEntry>();
  private readonly readImage: (path: string) => Promise<VaultImage | null>;
  private readonly read: () => void;
  private readonly stored: AssetStoring | undefined;

  constructor(readImage: (path: string) => Promise<VaultImage | null>, read: () => void, stored?: AssetStoring) {
    this.readImage = readImage;
    this.read = read;
    this.stored = stored;
  }

  /** The artwork at a path, or null while it is being read, missing, or not stored for players. */
  get(path: string): AssetRef | null {
    const entry = this.art.get(path);
    if (entry !== undefined) return entry === 'reading' ? null : entry;
    this.art.set(path, 'reading');
    void this.refOf(path).then((ref) => {
      if (this.art.get(path) !== 'reading') return;
      this.art.set(path, ref);
      if (ref !== null) this.read();
    });
    return null;
  }

  /** Forgets every path: a new scene reads its artwork afresh. */
  clear(): void {
    this.art.clear();
  }

  private async refOf(path: string): Promise<AssetRef | null> {
    try {
      const image = await this.readImage(path);
      if (image === null || this.stored === undefined) return null;
      return await this.stored.refOf(image.bytes, image.mime, ASSET_USES.art, path);
    } catch {
      return null;
    }
  }
}
