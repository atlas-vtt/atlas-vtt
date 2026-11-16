import type { AssetRef } from '../../../../src/app/online/protocol/index.ts';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import type { AssetStoring } from '../../../../src/app/online/gm/assets/assetUses.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { SALT } from './fakeAssetStore.ts';

/*
 * The asset store as a share sees it, for tests of what players are sent: every asset is stored and
 * named by the id a GM with `SALT` gives it, unless a test refuses it.
 */

/** The reference players are handed of `bytes`: by hash, with the id the store keeps it under. */
export async function storedRef(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<AssetRef> {
  const hash = await sha256Hex(bytes);
  return { hash, size: bytes.length, mime, id: await assetIdOf(SALT, hash) };
}

/**
 * A store that keeps everything handed to it, but what `refuse` names (by hash); `file` gives the bytes
 * of a vault file it is handed by path (none by default); `released` hears of references let go.
 */
export function fakeStoring(refuse: (hash: string) => boolean = () => false, file: (path: string) => Uint8Array<ArrayBuffer> | undefined = () => undefined, released: (ref: AssetRef) => void = () => undefined): AssetStoring {
  const refOf = async (bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<AssetRef | null> => {
    const ref = await storedRef(bytes, mime);
    return refuse(ref.hash) ? null : ref;
  };
  return {
    refOf,
    fileRef: (path, mime) => {
      const bytes = file(path);
      return bytes === undefined ? Promise.resolve(null) : refOf(bytes, mime);
    },
    mapRef: (bytes, mime) => refOf(bytes, mime),
    release: released,
  };
}

/** A reference a test expects the store to keep. */
export function kept(ref: AssetRef | null): AssetRef {
  if (ref === null) throw new Error('The store did not keep the asset');
  return ref;
}
