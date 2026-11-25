import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { AssetService, CollectionMetadata } from '../../../src/app/services/AssetService';
import { installFilePath } from '../../../src/app/services/library/libraryPaths';
import { installedListings, musicWalkEnds } from '../../../src/app/armarium/installedListings';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';

const LISTED = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const PRIVATE = '6f1c2b8e-private-collection';

const collection = (id: string, uid: string, version = 1): CollectionMetadata => ({ id, uid, name: id, version } as CollectionMetadata);
const record = (collectionId: string, uid: string, version: number): string =>
  JSON.stringify({ uid, collectionId, version, files: {}, assets: {}, fields: {} });

function vaultWith(files: Record<string, string>): App {
  return {
    vault: {
      getFiles: () => [],
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

  it('reads every record at once, and a record that cannot be read leaves the others told', async () => {
    let reading = 0;
    let most = 0;
    const files: Record<string, string> = {
      [installFilePath('Skeletons')]: record('Skeletons', LISTED, 5),
      [installFilePath('Broken')]: '{',
      [installFilePath('Later')]: record('Later', 'b-listing', 2),
    };
    const app = {
      vault: {
        getFiles: () => [],
      getFileByPath: (path: string) => (path in files ? { path } : null),
        read: async (file: { path: string }) => {
          reading += 1;
          most = Math.max(most, reading);
          await new Promise((resolve) => setTimeout(resolve, 0));
          reading -= 1;
          return files[file.path]!;
        },
        adapter: { exists: async () => false },
      },
    } as unknown as App;
    const assets = assetsWith([collection('Skeletons', LISTED, 5), collection('Broken', 'c-listing'), collection('Later', 'b-listing', 2)]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const items = await installedListings(app, assets, new Set([LISTED, 'b-listing', 'c-listing']));
      expect(items).toEqual([{ uid: LISTED, version: 5 }, { uid: 'b-listing', version: 2 }]);
      expect(most).toBe(3);
    } finally {
      error.mockRestore();
    }
  });

  it('ignores a record that belongs to another collection', async () => {
    const app = vaultWith({ [installFilePath('Copy')]: record('Copy', 'someone-else', 9) });
    expect(await installedListings(app, assetsWith([collection('Copy', LISTED)]), new Set([LISTED]))).toEqual([]);
  });

  it('reads albums and tracks of the music folder by their sidecars, the listed ones only', async () => {
    const location = new FakeSoundLocation();
    const sidecar = (uid: string, version: number, kind: string, file: string): Blob => new Blob([JSON.stringify({ format: 1, uid, version, kind, name: 'N', artist: null, tracks: [{ file, sha256: 'a'.repeat(64) }] })]);
    location.put('Mara/Old Roads/01 Dawn.opus', new Blob(['x']));
    location.put('Mara/Old Roads/Armarium.json', sidecar(LISTED, 3, 'music-album', '01 Dawn.opus'));
    location.put('Dawn.opus', new Blob(['x']));
    location.put('Dawn.armarium.json', sidecar('b-listing', 2, 'music-track', 'Dawn.opus'));
    location.put('Mine/Song.opus', new Blob(['x']));
    location.put('Mine/Armarium.json', sidecar(PRIVATE, 1, 'music-album', 'Song.opus'));
    const files = [...location.files.values()].map((entry) => ({ entry }));
    const library = { locationOf: () => location, filesOf: () => files, isWalked: () => true, onChange: () => () => undefined, rescan: () => undefined, destroy: () => undefined } as unknown as SoundLibrary;
    const app = vaultWith({});
    SoundLibrary.provide(app, library);
    try {
      expect(await installedListings(app, assetsWith([]), new Set([LISTED, 'b-listing']))).toEqual([{ uid: LISTED, version: 3 }, { uid: 'b-listing', version: 2 }]);
    } finally {
      SoundLibrary.release(app);
    }
  });
  it('tells the music it knows without waiting, asks for the first walk, and says when the music folder has been read whole', async () => {
    const location = new FakeSoundLocation();
    location.put('Mara/Old Roads/01 Dawn.opus', new Blob(['x']));
    location.put('Mara/Old Roads/Armarium.json', new Blob([JSON.stringify({ format: 1, uid: LISTED, version: 3, kind: 'music-album', name: 'N', artist: null, tracks: [{ file: '01 Dawn.opus', sha256: 'a'.repeat(64) }] })]));
    const files = [...location.files.values()].map((entry) => ({ entry }));
    let walked = false;
    const listeners = new Set<() => void>();
    const rescan = vi.fn();
    const library = {
      locationOf: () => location, filesOf: () => (walked ? files : []), isWalked: () => walked, rescan, destroy: () => undefined,
      onChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    } as unknown as SoundLibrary;
    const app = vaultWith({});
    SoundLibrary.provide(app, library);
    vi.stubGlobal('window', globalThis);
    try {
      const started = Date.now();
      expect(await installedListings(app, assetsWith([]), new Set([LISTED]))).toEqual([]);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(rescan).toHaveBeenCalled();
      const ends = musicWalkEnds(app);
      walked = true;
      for (const listener of listeners) listener();
      expect(await ends).toBe(true);
      expect(await installedListings(app, assetsWith([]), new Set([LISTED]))).toEqual([{ uid: LISTED, version: 3 }]);
      expect(await musicWalkEnds(app)).toBe(false);
    } finally {
      SoundLibrary.release(app);
      vi.unstubAllGlobals();
    }
  });
});
