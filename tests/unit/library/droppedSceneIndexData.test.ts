import { describe, expect, it } from 'vitest';
import type { Asset, AssetMetadata } from '../../../src/app/services/AssetService';
import { mergeLibraryChanges } from '../../../src/app/services/library/mergeLibraryChanges';
import type { LibraryChanges, RecordReading } from '../../../src/app/services/library/libraryReader';
import { assetKey, emptyLibraryState } from '../../../src/app/services/library/libraryState';
import type { KeptSceneIndexData } from '../../../src/app/services/sceneIndexData';

const OLD = 'atlas-vtt/collections/Fen/scenes/keep.json';
const NEW = 'atlas-vtt/collections/Moor/scenes/keep.json';
const OWN = { extensions: { ext: { shared: true } }, createdBy: 'ext', createdImages: ['atlas-vtt/collections/Fen/scenes/keep.webp'] };

const scene = (collection: string, filePath: string, data: object): Asset =>
  ({ id: 'keep', type: 'scene', name: 'Keep', tags: [], collection, filePath, createdAt: 1, modifiedAt: 2, data }) as Asset;

const metadata = (): AssetMetadata => ({
  collections: {}, defaultCollectionId: 'Fen', version: 2,
  assets: { keep: scene('Fen', OLD, { mapPath: 'atlas-vtt/collections/Fen/scenes/keep.atlasmap', ...OWN }) },
} as unknown as AssetMetadata);

const changes = (fields: Partial<LibraryChanges>): LibraryChanges =>
  ({ records: [], payloads: [], collections: [], library: null, removed: [], touched: [], ...fields });

const arriving = (record: Asset, path: string): RecordReading => ({ path, hash: 'h2', mtime: 5, size: 10, newer: false, record, writtenFor: record.collection });

function sync(): { index: AssetMetadata; read: (next: LibraryChanges) => void; dropped: Map<string, KeptSceneIndexData> } {
  const index = metadata();
  const state = emptyLibraryState();
  state.files[OLD] = { key: assetKey('keep'), hash: 'h1', mtime: 1, size: 10 };
  const dropped = new Map<string, KeptSceneIndexData>();
  const vault = { hasCollectionFile: () => true, settledCopy: () => true, droppedIndexData: dropped };
  return { index, dropped, read: (next) => { mergeLibraryChanges(index, state, next, true, vault); } };
}

describe("a scene whose record file moves between two library reads", () => {
  it('keeps its extension data and creator note when it comes back from its new path with the same map', () => {
    const { index, read, dropped } = sync();
    // The sync tool delivers the removal of the record file first, then the file again at its new path.
    read(changes({ removed: [{ path: OLD, stamp: { key: assetKey('keep'), hash: 'h1', mtime: 1, size: 10 } }] }));
    expect(index.assets.keep).toBeUndefined();
    read(changes({ records: [arriving(scene('Moor', NEW, { mapPath: 'atlas-vtt/collections/Fen/scenes/keep.atlasmap' }), NEW)] }));

    expect((index.assets.keep as { data: unknown }).data).toEqual({ mapPath: 'atlas-vtt/collections/Fen/scenes/keep.atlasmap', ...OWN });
    expect(dropped.size).toBe(0);
  });

  it('keeps its extension data but drops the creator note and images when the file names another map', () => {
    const { index, read } = sync();
    // Another device moved the scene to Moor, or a file was forged: the permission was granted for the indexed map only.
    read(changes({ removed: [{ path: OLD, stamp: { key: assetKey('keep'), hash: 'h1', mtime: 1, size: 10 } }] }));
    read(changes({ records: [arriving(scene('Moor', NEW, { mapPath: 'atlas-vtt/collections/Moor/scenes/keep.atlasmap' }), NEW)] }));
    expect((index.assets.keep as { data: unknown }).data).toEqual({ mapPath: 'atlas-vtt/collections/Moor/scenes/keep.atlasmap', extensions: OWN.extensions });
  });

  it('never takes the data from the file, which can only carry what the index lost', () => {
    const { index, read } = sync();
    read(changes({ removed: [{ path: OLD, stamp: { key: assetKey('keep'), hash: 'h1', mtime: 1, size: 10 } }] }));
    const forged = scene('Moor', NEW, { mapPath: 'm.atlasmap', createdBy: 'other', createdImages: ['notes/secret.md'], extensions: { other: 1 } });
    read(changes({ records: [arriving(forged, NEW)] }));
    expect((index.assets.keep as { data: unknown }).data).toEqual({ mapPath: 'm.atlasmap', extensions: OWN.extensions });
  });

  it('a scene that never had any gets none back', () => {
    const { index, read, dropped } = sync();
    (index.assets.keep as { data: object }).data = { mapPath: 'm.atlasmap' };
    read(changes({ removed: [{ path: OLD, stamp: { key: assetKey('keep'), hash: 'h1', mtime: 1, size: 10 } }] }));
    expect(dropped.size).toBe(0);
    read(changes({ records: [arriving(scene('Moor', NEW, { mapPath: 'm.atlasmap', createdBy: 'ext' }), NEW)] }));
    expect((index.assets.keep as { data: unknown }).data).toEqual({ mapPath: 'm.atlasmap' });
  });
});
