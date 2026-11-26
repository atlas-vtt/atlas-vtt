import { describe, expect, it } from 'vitest';
import type { Asset, AssetMetadata, CollectionMetadata } from '../../../src/app/services/AssetService';
import { derivedCollectionRecord } from '../../../src/app/services/collectionRecords';
import { libraryFactsOf, serializeCollection, serializeLibrary } from '../../../src/app/services/library/collectionFile';
import { indexText, snapshotIndex } from '../../../src/app/services/library/indexSnapshot';
import { LibraryFileMemo, type DesiredFile } from '../../../src/app/services/library/libraryFiles';
import { collectionFilePath, LIBRARY_FILE, recordFilePath } from '../../../src/app/services/library/libraryPaths';
import { assetKey, collectionIdentity, collectionKey, LIBRARY_KEY } from '../../../src/app/services/library/libraryState';
import { isPayloadUnread, serializeRecord } from '../../../src/app/services/library/recordFile';
import { hashText } from '../../../src/app/utils/hashing';
import { seededRandom } from './fakeSync';

/**
 * A save works out the library's files from a text snapshot of the index and
 * remembers them between saves. Whatever happens to the index in between, by
 * replacing records or by changing them in place, the files must be the ones
 * working them all out anew from a copy of the index gives, as every save did
 * before, and the cache's text the one `JSON.stringify` gives.
 */

const TRIALS = Number(import.meta.env.VITE_LIBRARY_MEMO_TRIALS ?? 20);
const STEPS = 120;

interface FileAsWritten {
  key: string;
  identity: string;
  path: string;
  hash: string;
  content: string;
  payloadUnread: boolean;
  derivable: boolean;
}

/** Every file of the library, each worked out from a copy of the index: what a save did before it remembered any. */
function filesWorkedOutAnew(index: AssetMetadata): FileAsWritten[] {
  const metadata = structuredClone(index);
  const files: FileAsWritten[] = [];
  for (const asset of Object.values(metadata.assets)) {
    const path = recordFilePath(asset);
    if (!path) continue;
    const content = serializeRecord(asset);
    files.push({ key: assetKey(asset.id), identity: assetKey(asset.id), path, hash: hashText(content), content, payloadUnread: isPayloadUnread(asset), derivable: false });
  }
  for (const collection of Object.values(metadata.collections)) {
    const content = serializeCollection(collection);
    files.push({
      key: collectionKey(collection.id),
      identity: collectionIdentity(collection.uid),
      path: collectionFilePath(collection.id),
      hash: hashText(content),
      content,
      payloadUnread: false,
      derivable: content === serializeCollection(derivedCollectionRecord(collection.id)),
    });
  }
  const library = serializeLibrary(libraryFactsOf(metadata));
  const plain = library === serializeLibrary({ defaultCollectionId: 'Default' }) || library === serializeLibrary({});
  files.push({ key: LIBRARY_KEY, identity: LIBRARY_KEY, path: LIBRARY_FILE, hash: hashText(library), content: library, payloadUnread: false, derivable: plain });
  return files;
}

const asWritten = (files: readonly DesiredFile[]): FileAsWritten[] => files.map(({ content, ...file }) => ({ ...file, content: content() }));

const folderOf = (collection: string): string => `atlas-vtt/collections/${collection}`;

function token(id: string, collection: string): Asset {
  return { id, type: 'token', name: `Creature ${id}`, imagePath: `${folderOf(collection)}/tokens/${id}.webp`, tags: ['beast'], collection, createdAt: 1, modifiedAt: 1 };
}

function encounter(id: string, collection: string): Asset {
  const tokens = [{ id: 'token-1', name: 'Bog hag', imagePath: `${folderOf(collection)}/tokens/hag.webp`, x: 1, y: 2 }];
  return { id, type: 'encounter', name: `Ambush ${id}`, tokens, tags: [], collection, filePath: `${folderOf(collection)}/encounters/${id}.json`, createdAt: 1, modifiedAt: 1, data: { tokens: structuredClone(tokens), description: 'At the ford' } };
}

function scene(id: string, collection: string): Asset {
  return { id, type: 'scene', name: `Scene ${id}`, tags: [], collection, filePath: `${folderOf(collection)}/scenes/${id}.json`, createdAt: 1, modifiedAt: 1, data: { mapPath: `${folderOf(collection)}/scenes/${id}.atlasmap` } };
}

function collection(id: string): CollectionMetadata {
  return { id, uid: `uid-${id}`, version: 1, name: id, tags: {}, settings: { conditions: [] }, createdAt: 1, modifiedAt: 1 };
}

function library(): AssetMetadata {
  const assets: Record<string, Asset> = {};
  for (let index = 0; index < 12; index++) {
    const id = `${['token', 'encounter', 'scene'][index % 3]!}-${index}`;
    const home = index % 2 === 0 ? 'Fen' : 'Barrow';
    assets[id] = [token, encounter, scene][index % 3]!(id, home);
  }
  // Ids that read as numbers are listed first by JavaScript, wherever they were added.
  assets['7'] = token('7', 'Fen');
  assets['quote"d '] = token('quote"d ', 'Barrow');
  return { version: 2, vaultId: 'vault-a', defaultCollectionId: 'Fen', collections: { Fen: collection('Fen'), Barrow: derivedCollectionRecord('Barrow') }, assets };
}

type Loose = Record<string, unknown>;

/** Changes to an index as the service and its helpers make them: some replace a record, most change one in place. */
function changeSomething(metadata: AssetMetadata, random: () => number, step: number): void {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const ids = Object.keys(metadata.assets);
  const id = pick(ids);
  const asset = metadata.assets[id] as (Asset & Loose) | undefined;
  const collections = Object.keys(metadata.collections);
  const changes: Array<() => void> = [
    () => { if (asset) asset.name = `Renamed ${step}`; },
    () => { if (asset) asset.tags.push(`tag-${step}`); },
    () => { if (asset) asset.thumbnailPath = undefined; },
    () => { if (asset) delete asset.thumbnailPath; },
    () => { if (asset) asset.thumbnailPath = `thumbs/${step}.webp`; },
    () => { if (asset) asset.size = Number.NaN; },
    () => { if (asset) metadata.assets[id] = { ...asset }; },
    () => { if (asset) metadata.assets[id] = { ...asset, modifiedAt: step }; },
    () => { if (asset?.type === 'encounter' && asset.tokens?.[0]) asset.tokens[0].imagePath = `moved/${step}.webp`; },
    () => { if (asset?.type === 'encounter' && asset.data?.tokens?.[0]) asset.data.tokens[0].imagePath = `moved/${step}.webp`; },
    () => { if (asset?.type === 'encounter') asset.data = { ...asset.data, tokens: structuredClone(asset.tokens) }; },
    () => { if (asset?.type === 'encounter') asset.data = { ...asset.data, tokens: undefined }; },
    () => { if (asset?.type === 'encounter') (asset as Loose).tokens = undefined; },
    () => { if (asset?.type === 'encounter') asset.tokens = []; },
    () => { if (asset?.type === 'encounter' || asset?.type === 'scene') asset.data = undefined; },
    () => { if (asset?.type === 'scene') asset.data = { mapPath: `${folderOf(asset.collection)}/scenes/${step}.atlasmap` }; },
    () => { if (asset && asset.type !== 'token') asset.filePath = `${folderOf(asset.collection)}/${asset.type}s/deep/${step}.json`; },
    () => { if (asset && asset.type !== 'token') asset.filePath = undefined; },
    () => { if (asset) asset.collection = pick(collections); },
    () => { if (ids.length > 4) delete metadata.assets[id]; },
    () => { metadata.assets[`token-new-${step}`] = token(`token-new-${step}`, pick(collections)); },
    () => { metadata.assets[String(step)] = scene(String(step), pick(collections)); },
    () => { metadata.collections[pick(collections)]!.settings.conditions.push({ id: `c-${step}`, name: `Condition ${step}` }); },
    () => { metadata.collections[pick(collections)]!.description = step % 2 === 0 ? undefined : `Described ${step}`; },
    () => { metadata.collections[`Made ${step}`] = step % 2 === 0 ? collection(`Made ${step}`) : derivedCollectionRecord(`Made ${step}`); },
    () => { if (collections.length > 1) delete metadata.collections[pick(collections)]; },
    () => { metadata.defaultCollectionId = pick([...collections, undefined]); },
    () => { metadata.vaultId = pick(['vault-a', 'vault-b', undefined]); },
    () => { metadata.starterTokensAdded = pick([true, false, undefined]); },
    () => { (metadata as unknown as Loose).fromALaterVersion = pick([{ kept: step }, undefined]); },
  ];
  pick(changes)();
}

const bookkeeping = (step: number): string => JSON.stringify({ files: { [`path-${step}`]: { key: 'asset:token-1', hash: 'h', mtime: step, size: 1 } }, derived: {} });

describe('the files a save asks for', () => {
  it('are the ones worked out anew from a copy of the index, whatever changed it, in place or not', () => {
    for (let trial = 0; trial < TRIALS; trial++) {
      const random = seededRandom(trial + 1);
      const metadata = library();
      const memo = new LibraryFileMemo();
      for (let step = 0; step < STEPS; step++) {
        const changesInOneSave = 1 + Math.floor(random() * 3);
        for (let change = 0; change < changesInOneSave; change++) changeSomething(metadata, random, step * 10 + change);

        const snapshot = snapshotIndex(metadata);

        expect(asWritten(memo.files(snapshot)), `trial ${trial}, step ${step}`).toEqual(filesWorkedOutAnew(metadata));
        expect(indexText(snapshot, 'libraryState', bookkeeping(step)), `trial ${trial}, step ${step}`)
          .toBe(JSON.stringify({ ...structuredClone(metadata), libraryState: JSON.parse(bookkeeping(step)) }));
      }
    }
  }, 5000 + TRIALS * 200);

  it('are worked out from the index as it was when the snapshot was taken', () => {
    const metadata = library();
    const before = filesWorkedOutAnew(metadata);
    const text = JSON.stringify({ ...metadata, libraryState: {} });
    const snapshot = snapshotIndex(metadata);

    metadata.assets['token-0']!.name = 'Changed while the save waited';
    metadata.assets['encounter-1']!.tags.push('late');
    delete metadata.assets['scene-2'];
    metadata.collections.Fen!.settings.conditions.push({ id: 'late', name: 'Late' });
    metadata.defaultCollectionId = 'Barrow';

    expect(asWritten(new LibraryFileMemo().files(snapshot))).toEqual(before);
    expect(indexText(snapshot, 'libraryState', '{}')).toBe(text);
  });

  it('keep the file of a record that did not change and make a new one for a record changed in place', () => {
    const metadata = library();
    const memo = new LibraryFileMemo();
    const fileOf = (key: string): DesiredFile => memo.files(snapshotIndex(metadata)).find((file) => file.key === key)!;
    const [hag, ambush] = [fileOf('asset:token-0'), fileOf('asset:encounter-1')];

    (metadata.assets['encounter-1'] as Extract<Asset, { type: 'encounter' }>).tokens[0]!.x = 40;

    expect(fileOf('asset:token-0')).toBe(hag);
    expect(fileOf('asset:encounter-1')).not.toBe(ambush);
    expect(fileOf('asset:encounter-1').hash).not.toBe(ambush.hash);
    expect(JSON.parse(fileOf('asset:encounter-1').content()).atlasRecord.tokens[0]).toMatchObject({ x: 40 });
  });
});

describe('the text of the cache', () => {
  it('puts the bookkeeping where the index already has a field of its name', () => {
    const metadata = { ...library(), libraryState: { stale: true } } as AssetMetadata;

    expect(indexText(snapshotIndex(metadata), 'libraryState', '{"files":{}}')).toBe(JSON.stringify({ ...metadata, libraryState: { files: {} } }));
  });

  it('is not written from an index that holds no record under an id, so no file is taken for one that left', () => {
    const metadata = library();
    (metadata.assets as Record<string, unknown>)['token-0'] = undefined;

    expect(() => snapshotIndex(metadata)).toThrow(TypeError);
  });
});
