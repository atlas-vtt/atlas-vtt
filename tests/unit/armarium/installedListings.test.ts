import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import type { AssetService, CollectionMetadata } from '../../../src/app/services/AssetService';
import { installFilePath } from '../../../src/app/services/library/libraryPaths';
import { installedListings } from '../../../src/app/armarium/installedListings';

const LISTED = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const PRIVATE = '6f1c2b8e-private-collection';

const collection = (id: string, uid: string, version = 1): CollectionMetadata => ({ id, uid, name: id, version } as CollectionMetadata);
const record = (collectionId: string, uid: string, version: number): string =>
  JSON.stringify({ uid, collectionId, version, files: {}, assets: {}, fields: {} });

function vaultWith(files: Record<string, string>): App {
  return {
    vault: {
      getFileByPath: (path: string) => (path in files ? { path } : null),
      read: async (file: { path: string }) => files[file.path]!,
      adapter: { exists: async () => false },
    },
  } as unknown as App;
}

const assetsWith = (collections: CollectionMetadata[]): AssetService => ({ getCollections: async () => collections } as unknown as AssetService);

describe('the Armarium listings a vault holds', () => {
  it('reads them from the install records of collections whose uid is a listing\'s', async () => {
    const app = vaultWith({
      [installFilePath('Skeletons')]: record('Skeletons', LISTED, 5),
      [installFilePath('Mine')]: record('Mine', PRIVATE, 3),
    });
    const items = await installedListings(app, assetsWith([collection('Skeletons', LISTED, 5), collection('Mine', PRIVATE, 3)]), new Set([LISTED]));
    expect(items).toEqual([{ uid: LISTED, version: 5 }]);
  });

  it('holds a renamed collection by its uid, and none that was never installed', async () => {
    const app = vaultWith({ [installFilePath('My skeletons')]: record('Skeletons', LISTED, 4) });
    const assets = assetsWith([collection('My skeletons', LISTED, 4), collection('Fresh', 'b-listing')]);
    expect(await installedListings(app, assets, new Set([LISTED, 'b-listing']))).toEqual([{ uid: LISTED, version: 4 }]);
  });

  it('ignores a record that belongs to another collection', async () => {
    const app = vaultWith({ [installFilePath('Copy')]: record('Copy', 'someone-else', 9) });
    expect(await installedListings(app, assetsWith([collection('Copy', LISTED)]), new Set([LISTED]))).toEqual([]);
  });
});
