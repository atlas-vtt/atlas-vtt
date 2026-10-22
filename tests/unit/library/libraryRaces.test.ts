// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../../src/app/services/AssetService';
import { RECORD_KEY } from '../../../src/app/services/library/recordFile';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const CACHE = 'atlas-vtt/.atlas-data/assets-metadata.json';
const FEN = 'atlas-vtt/collections/Fen';

interface Device extends InMemoryApp {
  assets: AssetService;
}

async function device(files: Record<string, string>, folders: readonly string[] = []): Promise<Device> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({ files, folders: ['atlas-vtt/collections', ...folders] });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { ...vault, assets };
}

const synced = (vault: InMemoryApp): Record<string, string> =>
  Object.fromEntries([...vault.files].filter(([path]) => !path.split('/').some((part) => part.startsWith('.'))));

beforeEach(() => AssetService.resetInstance());

describe('what the user makes while Atlas checks the vault', () => {
  it('is written to its file, however the check and the edit overlap', async () => {
    const a = await device({});
    await a.assets.createCollection('Fen');
    await a.app.vault.create(`${FEN}/tokens/hag.webp`, 'IMG');
    const read = a.app.vault.read.getMockImplementation()!;
    let release = (): void => {};
    const paused = new Promise<void>((started) => {
      a.app.vault.read = vi.fn(async (file: { path: string }) => {
        started();
        await new Promise<void>((resolve) => { release = resolve; });
        a.app.vault.read = vi.fn(read);
        return read(file);
      });
    });
    await a.app.vault.adapter.write(`${FEN}/collection.json`, `${a.files.get(`${FEN}/collection.json`)!}\n`);

    const check = a.assets.reconcileWithVault();
    await paused;
    const encounter = a.assets.createEncounter({ name: 'Ambush', collection: 'Fen', tags: [], tokens: [] });
    release();
    const { id } = await encounter;
    await check;
    await a.assets.updateAsset(id, { name: 'Ambush at the ford' });

    expect(JSON.parse(a.files.get(`${FEN}/encounters/${id}.json`)!)[RECORD_KEY]).toMatchObject({ name: 'Ambush at the ford' });
    const [token] = await a.assets.getAssets('Fen', 'token');
    expect(token!.id).toMatch(/-recovered-/);
    await a.assets.updateAsset(token!.id, { name: 'Bog hag' });
    expect(JSON.parse(a.files.get(`${FEN}/tokens/${token!.id}.json`)!)[RECORD_KEY]).toMatchObject({ name: 'Bog hag' });
  });
});

describe('a collection renamed on another device, arriving in halves', () => {
  it('keeps its identity and its records\' ids when the new folder arrives before the old one goes', async () => {
    const a = await device({});
    await a.assets.createCollection('Fen');
    const encounter = await a.assets.createEncounter({ name: 'Ambush', collection: 'Fen', tags: [], tokens: [] });
    const { uid } = (await a.assets.getCollection('Fen'))!;
    const b = await device(synced(a));

    // The renamed folder arrives first, then a check runs, then the old folder goes.
    for (const [path, content] of Object.entries(synced(a))) {
      if (path.startsWith(`${FEN}/`)) await b.app.vault.adapter.write(`atlas-vtt/collections/Marsh/${path.slice(FEN.length + 1)}`, content);
    }
    await b.assets.reconcileWithVault();
    const gone = new Set<string>();
    for (const path of [...b.files.keys()].filter((path) => path.startsWith(`${FEN}/`))) {
      await b.app.vault.adapter.remove(path);
      gone.add(path);
    }
    b.folders.delete(FEN);
    for (const folder of [...b.folders].filter((folder) => folder.startsWith(`${FEN}/`))) b.folders.delete(folder);
    await b.assets.reconcileWithVault(gone);

    expect(await b.assets.getCollection('Marsh')).toMatchObject({ uid });
    expect((await b.assets.getAssets('Marsh', 'encounter')).map((asset) => asset.id)).toEqual([encounter.id]);
    expect(JSON.parse(b.files.get('atlas-vtt/collections/Marsh/collection.json')!)).toMatchObject({ uid });
  });
});

describe('the first start of this version', () => {
  it('writes a record an earlier version adopted from a file and the user changed', async () => {
    const art = `${FEN}/tokens/hag.webp`;
    const a = await device({
      [art]: 'IMG',
      [CACHE]: JSON.stringify({
        version: 2,
        collections: { Fen: { id: 'Fen', uid: 'uid-fen', version: 1, name: 'Fen', tags: {}, settings: { conditions: [] }, createdAt: 1, modifiedAt: 1 } },
        assets: {
          'token-recovered-abc': { id: 'token-recovered-abc', type: 'token', name: 'Bog hag', imagePath: art, tags: ['hag'], statblockPath: 'Bog hag.md', collection: 'Fen', createdAt: 1, modifiedAt: 5 },
        },
      }),
    });

    expect(JSON.parse(a.files.get(`${FEN}/tokens/token-recovered-abc.json`)!)[RECORD_KEY]).toMatchObject({ tags: ['hag'], statblockPath: 'Bog hag.md' });
  });

  it('ignores the visible index of older versions once another device wrote the library, and retires it once this one has', async () => {
    const legacy = 'atlas-vtt/assets-metadata.json';
    const frozen = JSON.stringify({
      version: 2,
      collections: { Fen: { id: 'Fen', uid: 'uid-fen', version: 1, name: 'Fen', tags: {}, settings: { conditions: [] }, createdAt: 1, modifiedAt: 1 } },
      assets: { 'encounter-x': { id: 'encounter-x', type: 'encounter', name: 'Deleted since', tokens: [], tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1 } },
    });
    const migrated = await device({ [legacy]: frozen, 'atlas-vtt/library.json': JSON.stringify({ format: 1, vaultId: 'v' }) });
    expect(await migrated.assets.getAssetById('encounter-x')).toBeNull();

    const first = await device({ [legacy]: frozen });
    expect(await first.assets.getAssetById('encounter-x')).not.toBeNull();
    expect(first.files.has(legacy)).toBe(false);
  });
});
