import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type Asset, type EncounterAsset } from '../../../src/app/services/AssetService';
import { RECORD_KEY, serializeRecord } from '../../../src/app/services/library/recordFile';
import { hashText } from '../../../src/app/utils/hashing';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/services/library/recordFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/app/services/library/recordFile')>();
  return { ...actual, serializeRecord: vi.fn(actual.serializeRecord) };
});
vi.mock('../../../src/app/utils/hashing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/app/utils/hashing')>();
  return { ...actual, hashText: vi.fn(actual.hashText) };
});

/**
 * A save finds the records that changed without serializing the library: its
 * work on record files grows with what changed, not with what the library holds.
 */

const CACHE = 'atlas-vtt/.atlas-data/assets-metadata.json';
const COLLECTIONS = ['Fen', 'Barrow', 'Keep'];
const RECORDS = 600;
/** A save may serialize a changed record for its stamp and again for its file, and hash it and the file it replaces. */
const PER_CHANGED_RECORD = 4;
/** The few facts of `library.json` are hashed by every save. */
const LIBRARY_FACTS = 1;

const folderOf = (index: number): string => `atlas-vtt/collections/${COLLECTIONS[index % COLLECTIONS.length]!}`;
const artOf = (index: number): string => `${folderOf(index)}/tokens/creature-${index}.webp`;
const tokenRecordOf = (index: number): string => `${folderOf(index)}/tokens/token-${index}.json`;
const encounterFileOf = (index: number): string => `${folderOf(index)}/encounters/encounter-${index}.json`;

/** A library as the cache of a device holds it: tokens, and every tenth record an encounter of two of them. */
function library(): Record<string, string> {
  const assets: Record<string, Asset> = {};
  const files: Record<string, string> = {};
  for (let index = 0; index < RECORDS; index++) {
    const collection = COLLECTIONS[index % COLLECTIONS.length]!;
    const base = { name: `Creature ${index}`, tags: ['beast'], collection, createdAt: 1000 + index, modifiedAt: 2000 + index };
    if (index % 10 === 9) {
      const tokens = [index - 3, index - 6].map((token) => ({ id: `token-${token}`, name: `Creature ${token}`, imagePath: artOf(token) }));
      assets[`encounter-${index}`] = { ...base, id: `encounter-${index}`, type: 'encounter', tokens, filePath: encounterFileOf(index), data: { tokens, description: 'At the ford' } };
    } else {
      assets[`token-${index}`] = { ...base, id: `token-${index}`, type: 'token', imagePath: artOf(index) };
      files[artOf(index)] = 'IMG';
    }
  }
  const collections = Object.fromEntries(COLLECTIONS.map((id) => [id, { id, uid: `uid-${id}`, version: 1, name: id, tags: {}, settings: { conditions: [] }, createdAt: 1, modifiedAt: 1 }]));
  files[CACHE] = JSON.stringify({ version: 2, vaultId: 'vault-a', defaultCollectionId: 'Fen', collections, assets });
  return files;
}

interface Device extends InMemoryApp {
  assets: AssetService;
}

/** A device whose library is in its files, as after any start. */
async function device(): Promise<Device> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({ files: library(), folders: ['atlas-vtt/collections'] });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.vaultChecked();
  return { ...vault, assets };
}

const recordIn = (vault: InMemoryApp, path: string): Record<string, unknown> => JSON.parse(vault.files.get(path)!)[RECORD_KEY];

/** Counts the records a step serializes and the texts it hashes. */
async function workOf(step: () => Promise<void>): Promise<{ serialized: number; hashed: number }> {
  vi.mocked(serializeRecord).mockClear();
  vi.mocked(hashText).mockClear();
  await step();
  return { serialized: vi.mocked(serializeRecord).mock.calls.length, hashed: vi.mocked(hashText).mock.calls.length };
}

beforeEach(() => AssetService.resetInstance());

describe('the work of a save', () => {
  it('serializes and hashes the record that changed, not the library', async () => {
    const a = await device();
    expect(await a.assets.getAssets()).toHaveLength(RECORDS);

    const work = await workOf(() => a.assets.updateAsset('token-0', { name: 'Bog hag' }));

    expect(recordIn(a, tokenRecordOf(0))).toMatchObject({ name: 'Bog hag' });
    expect(work.serialized).toBeLessThanOrEqual(PER_CHANGED_RECORD);
    expect(work.hashed).toBeLessThanOrEqual(PER_CHANGED_RECORD + LIBRARY_FACTS);
  });

  it('grows with the records that changed', async () => {
    const a = await device();
    const tags = Array.from({ length: 20 }, (_, index) => ({ id: `token-${index * 10}`, tags: ['beast', 'swamp'] }));

    const work = await workOf(() => a.assets.updateTagsOfAssets(tags));

    expect(recordIn(a, tokenRecordOf(70))).toMatchObject({ tags: ['beast', 'swamp'] });
    expect(work.serialized).toBeLessThanOrEqual(tags.length * PER_CHANGED_RECORD);
    expect(work.hashed).toBeLessThanOrEqual(tags.length * PER_CHANGED_RECORD + LIBRARY_FACTS);
  });

  it('does none of it when nothing changed', async () => {
    const a = await device();

    const work = await workOf(() => a.assets.rewriteAssets(() => true));

    expect(work).toEqual({ serialized: 0, hashed: LIBRARY_FACTS });
  });
});

describe('a record changed in place', () => {
  it('is written by the next save, though no one said which record changed', async () => {
    const a = await device();
    await a.assets.rewriteAssets((asset) => {
      if (asset.id === 'token-4') asset.name = 'Marsh light';
      return false;
    });
    expect(recordIn(a, tokenRecordOf(4))).toMatchObject({ name: 'Creature 4' });

    await a.assets.updateAsset('token-0', { name: 'Bog hag' });

    expect(recordIn(a, tokenRecordOf(4))).toMatchObject({ name: 'Marsh light' });
  });

  it('is written when the change lies deep inside it', async () => {
    const a = await device();
    await a.assets.rewriteAssets((asset) => {
      if (asset.id !== 'encounter-9') return false;
      const encounter: EncounterAsset = asset as EncounterAsset;
      encounter.tokens[1]!.imagePath = 'atlas-vtt/collections/Fen/tokens/elsewhere.webp';
      encounter.data!.tokens![1]!.imagePath = 'atlas-vtt/collections/Fen/tokens/elsewhere.webp';
      return true;
    });

    const file = JSON.parse(a.files.get(encounterFileOf(9))!);
    expect(file.tokens[1]).toMatchObject({ imagePath: 'atlas-vtt/collections/Fen/tokens/elsewhere.webp' });
    expect(file.tokens[0]).toMatchObject({ imagePath: artOf(6) });
  });

  it('is written again when it is changed back', async () => {
    const a = await device();
    const rename = (name: string): Promise<boolean> => a.assets.rewriteAssets((asset) => {
      if (asset.id !== 'token-4') return false;
      asset.name = name;
      return true;
    });

    await rename('Marsh light');
    expect(recordIn(a, tokenRecordOf(4))).toMatchObject({ name: 'Marsh light' });
    await rename('Creature 4');

    expect(recordIn(a, tokenRecordOf(4))).toMatchObject({ name: 'Creature 4' });
  });
});

describe('the cache a save writes', () => {
  it('holds the index and the bookkeeping as one JSON text', async () => {
    const a = await device();
    await a.assets.updateAsset('token-0', { name: 'Bog "hag"\n' });

    const text = a.files.get(CACHE)!;
    const cache = JSON.parse(text);

    expect(JSON.stringify(cache)).toBe(text);
    expect(Object.keys(cache)).toEqual(['version', 'vaultId', 'defaultCollectionId', 'collections', 'assets', 'libraryState']);
    expect(Object.keys(cache.assets)).toHaveLength(RECORDS);
    expect(cache.assets['token-0']).toMatchObject({ name: 'Bog "hag"\n' });
    expect(cache.libraryState.files[tokenRecordOf(0)]).toMatchObject({ key: 'asset:token-0' });
  });
});
