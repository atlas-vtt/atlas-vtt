// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService } from '../../../src/app/services/AssetService';
import { RECORD_KEY } from '../../../src/app/services/library/recordFile';
import { COPY_SETTLE_MS, libraryClock } from '../../../src/app/services/library/libraryState';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const CACHE = 'atlas-vtt/.atlas-data/assets-metadata.json';
const FEN = 'atlas-vtt/collections/Fen';
const ART = `${FEN}/tokens/hag.webp`;
const TOKEN_RECORD = `${FEN}/tokens/token-1.json`;
const ENCOUNTER = `${FEN}/encounters/encounter-1.json`;

interface Device extends InMemoryApp {
  assets: AssetService;
}

/** A device whose vault holds `files`, with Atlas started on it. */
async function device(files: Record<string, string>): Promise<Device> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({ files, folders: ['atlas-vtt/collections'] });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { ...vault, assets };
}

/** An index as a version before record files left it: everything in the cache, the encounter's payload only in its file. */
function olderVault(): Record<string, string> {
  return {
    [CACHE]: JSON.stringify({
      version: 2,
      vaultId: 'vault-a',
      defaultCollectionId: 'Fen',
      collections: {
        Fen: { id: 'Fen', uid: 'uid-fen', version: 1, name: 'Fen', tags: {}, settings: { conditions: [{ id: 'mired', name: 'Mired' }] }, createdAt: 1, modifiedAt: 1 },
      },
      assets: {
        'token-1': { id: 'token-1', type: 'token', name: 'Bog hag', imagePath: ART, tags: ['hag'], collection: 'Fen', createdAt: 1, modifiedAt: 1 },
        'encounter-1': { id: 'encounter-1', type: 'encounter', name: 'Ambush', tokens: [], tags: [], collection: 'Fen', filePath: ENCOUNTER, createdAt: 1, modifiedAt: 1 },
      },
    }),
    [ART]: 'IMG',
    [ENCOUNTER]: JSON.stringify({ tokens: [{ id: 'token-1', name: 'Bog hag', imagePath: ART }], description: 'At the ford' }, null, 2),
  };
}

/** The vault's files a sync tool carries: everything outside dot folders. */
function syncedFiles(vault: InMemoryApp): Record<string, string> {
  return Object.fromEntries([...vault.files].filter(([path]) => !path.split('/').some((part) => part.startsWith('.'))));
}

/** Writes a file the way a sync tool does: a new modification time, no event Atlas caused. */
async function arrive(vault: InMemoryApp, path: string, content: string): Promise<void> {
  await vault.app.vault.adapter.write(path, content);
}

function editRecord(vault: InMemoryApp, path: string, edit: (record: Record<string, unknown>) => void): string {
  const file = JSON.parse(vault.files.get(path)!);
  edit(file[RECORD_KEY]);
  return JSON.stringify(file, null, 2);
}

beforeEach(() => AssetService.resetInstance());

describe('the first start of this version', () => {
  it('writes every record, collection and the library to vault files, keeping payloads only the files held', async () => {
    const a = await device(olderVault());

    expect(JSON.parse(a.files.get(TOKEN_RECORD)!)[RECORD_KEY]).toMatchObject({ id: 'token-1', name: 'Bog hag', tags: ['hag'] });
    const encounter = JSON.parse(a.files.get(ENCOUNTER)!);
    expect(encounter).toMatchObject({ description: 'At the ford', tokens: [{ id: 'token-1' }] });
    expect(encounter[RECORD_KEY]).toMatchObject({ id: 'encounter-1', name: 'Ambush' });
    expect(JSON.parse(a.files.get(`${FEN}/collection.json`)!)).toMatchObject({ uid: 'uid-fen', settings: { conditions: [{ id: 'mired' }] } });
    expect(JSON.parse(a.files.get('atlas-vtt/library.json')!)).toMatchObject({ defaultCollectionId: 'Fen', vaultId: 'vault-a' });
    expect(a.app.loadLocalStorage('atlas-vtt:library-files')).toBe(true);
  });

  it('keeps the payload the index held over the older file, since older versions updated it in the index alone', async () => {
    const files = olderVault();
    const index = JSON.parse(files[CACHE]!);
    const moved = `${FEN}/tokens/hag-moved.webp`;
    index.assets['encounter-1'].tokens = [{ id: 'token-1', name: 'Bog hag', imagePath: moved }];
    index.assets['encounter-1'].data = { description: 'At the ford', tokens: [{ id: 'token-1', name: 'Bog hag', imagePath: moved }] };
    // Rewriting the refs stamped the record after the file was written.
    index.assets['encounter-1'].modifiedAt = 1_000_000;
    files[CACHE] = JSON.stringify(index);

    const a = await device(files);

    expect(await a.assets.getAssetById('encounter-1')).toMatchObject({ tokens: [{ imagePath: moved }], data: { tokens: [{ imagePath: moved }] } });
    expect(JSON.parse(a.files.get(ENCOUNTER)!)).toMatchObject({ tokens: [{ imagePath: moved }], [RECORD_KEY]: { id: 'encounter-1' } });
  });

  it('keeps the payload the index held when the file is newer, as after an art rename older versions followed in the index alone', async () => {
    const files = olderVault();
    const index = JSON.parse(files[CACHE]!);
    const moved = `${FEN}/tokens/hag-moved.webp`;
    // The rename left `modifiedAt` as it was, older than the file.
    index.assets['encounter-1'].tokens = [{ id: 'token-1', name: 'Bog hag', imagePath: moved }];
    index.assets['encounter-1'].data = { description: 'At the ford', tokens: [{ id: 'token-1', name: 'Bog hag', imagePath: moved }] };
    files[CACHE] = JSON.stringify(index);

    const a = await device(files);

    expect(JSON.parse(a.files.get(ENCOUNTER)!)).toMatchObject({ tokens: [{ imagePath: moved }] });
  });

  it('keeps an edit another device made on an older version, though the device that upgrades first writes its older copy', async () => {
    // Both devices ran an older version; A added the hag to the encounter later than B last changed it.
    const shared = olderVault();
    const indexOn = (tokens: unknown[], modifiedAt: number): string => {
      const index = JSON.parse(shared[CACHE]!);
      index.assets['encounter-1'] = { ...index.assets['encounter-1'], tokens, data: { description: 'At the ford', tokens }, modifiedAt };
      return JSON.stringify(index);
    };
    const hag = [{ id: 'token-1', name: 'Bog hag', imagePath: ART }];

    const b = await device({ ...shared, [CACHE]: indexOn([], 5) });
    expect(JSON.parse(b.files.get(ENCOUNTER)!)).toMatchObject({ tokens: [] });

    const a = await device({ ...syncedFiles(b), [CACHE]: indexOn(hag, 50) });
    expect(await a.assets.getAssetById('encounter-1')).toMatchObject({ tokens: hag });
    expect(JSON.parse(a.files.get(ENCOUNTER)!)).toMatchObject({ tokens: hag });
  });

  it('keeps an art rename another device followed on an older version, which left the encounter\'s time as it was', async () => {
    const shared = olderVault();
    const indexOn = (imagePath: string): string => {
      const index = JSON.parse(shared[CACHE]!);
      const tokens = [{ id: 'token-1', name: 'Bog hag', imagePath }];
      index.assets['encounter-1'] = { ...index.assets['encounter-1'], tokens, data: { description: 'At the ford', tokens } };
      return JSON.stringify(index);
    };
    const renamed = `${FEN}/tokens/bog-hag.webp`;

    const b = await device({ ...shared, [CACHE]: indexOn(ART) });
    const a = await device({ ...syncedFiles(b), [CACHE]: indexOn(renamed) });

    expect(await a.assets.getAssetById('encounter-1')).toMatchObject({ tokens: [{ imagePath: renamed }] });
  });

  it('keeps a record this device edited after the version another device migrated, and writes it', async () => {
    const a = await device(olderVault());
    const files = { ...syncedFiles(a), [CACHE]: olderVault()[CACHE]! };
    const index = JSON.parse(files[CACHE]!);
    index.assets['token-1'] = { ...index.assets['token-1'], name: 'Renamed here', tags: ['hag', 'boss'], modifiedAt: 1_000_000 };
    files[CACHE] = JSON.stringify(index);

    const b = await device(files);

    expect(await b.assets.getAssetById('token-1')).toMatchObject({ name: 'Renamed here', tags: ['hag', 'boss'] });
    expect(JSON.parse(b.files.get(TOKEN_RECORD)!)[RECORD_KEY]).toMatchObject({ name: 'Renamed here' });
  });
});

describe('a second device', () => {
  it('builds its index from the synced files alone and writes nothing back', async () => {
    const a = await device(olderVault());
    const synced = syncedFiles(a);

    const b = await device(synced);

    expect(await b.assets.getAssetById('token-1')).toMatchObject({ name: 'Bog hag', tags: ['hag'], imagePath: ART });
    expect(await b.assets.getAssetById('encounter-1')).toMatchObject({ name: 'Ambush', data: { description: 'At the ford' } });
    expect(b.assets.getCollectionSettings('Fen').conditions).toEqual([{ id: 'mired', name: 'Mired' }]);
    expect(b.assets.getDefaultCollectionId()).toBe('Fen');
    expect(await b.assets.getVaultId()).toBe('vault-a');
    expect(syncedFiles(b)).toEqual(synced);
  });

  it('takes in records another device changed, and tells open maps about changed collection rules', async () => {
    const a = await device(olderVault());
    const b = await device(syncedFiles(a));

    await arrive(b, TOKEN_RECORD, editRecord(b, TOKEN_RECORD, (record) => { record.name = 'Bog crone'; }));
    const collection = JSON.parse(b.files.get(`${FEN}/collection.json`)!);
    collection.settings.conditions.push({ id: 'chilled', name: 'Chilled' });
    await arrive(b, `${FEN}/collection.json`, JSON.stringify(collection, null, 2));
    await b.assets.refreshMetadata();

    expect((await b.assets.getAssetById('token-1'))?.name).toBe('Bog crone');
    expect(b.assets.getCollectionSettings('Fen').conditions.map((condition) => condition.id)).toEqual(['mired', 'chilled']);
    expect(b.app.workspace.trigger).toHaveBeenCalledWith('atlas-vtt:collection-settings-changed', 'Fen');
  });

  it('drops a record another device deleted and never writes it back', async () => {
    const a = await device(olderVault());
    const b = await device(syncedFiles(a));

    await b.app.vault.adapter.remove(ENCOUNTER);
    await b.assets.reconcileWithVault(new Set([ENCOUNTER]));
    await b.assets.updateAsset('token-1', { name: 'Bog crone' });

    expect(await b.assets.getAssetById('encounter-1')).toBeNull();
    expect(b.files.has(ENCOUNTER)).toBe(false);
  });

  it('keeps a token whose record arrived before its art, and while its art is gone, until its record file goes', async () => {
    const a = await device(olderVault());
    const files = syncedFiles(a);
    delete files[ART];
    const b = await device(files);

    expect(await b.assets.getAssetById('token-1')).not.toBeNull();

    await arrive(b, ART, 'IMG');
    await b.assets.reconcileWithVault();
    expect(await b.assets.getAssetById('token-1')).toMatchObject({ imagePath: ART });

    // Another device's rename can arrive as a deletion before the record that names the new file.
    await b.app.vault.adapter.remove(ART);
    await b.assets.reconcileWithVault(new Set([ART]));
    expect(await b.assets.getAssetById('token-1')).not.toBeNull();
    expect(b.files.has(TOKEN_RECORD)).toBe(true);

    await b.app.vault.adapter.remove(TOKEN_RECORD);
    await b.assets.reconcileWithVault(new Set([TOKEN_RECORD]));
    expect(await b.assets.getAssetById('token-1')).toBeNull();
  });

  it('writes nothing for art that arrived before its record, and keeps one token once the record arrives', async () => {
    const a = await device(olderVault());
    const files = syncedFiles(a);
    const record = files[TOKEN_RECORD]!;
    delete files[TOKEN_RECORD];
    const b = await device(files);

    const recovered = await b.assets.getAssets('Fen', 'token');
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.id).toMatch(/-recovered-/);
    expect([...b.files.keys()].filter((path) => path.startsWith(`${FEN}/tokens/`) && path.endsWith('.json'))).toEqual([]);

    await arrive(b, TOKEN_RECORD, record);
    await b.assets.reconcileWithVault();
    expect((await b.assets.getAssets('Fen', 'token')).map((token) => token.id)).toEqual(['token-1']);
  });

  it('leaves alone a copy a sync tool made of a record on a conflict', async () => {
    const a = await device(olderVault());
    const b = await device(syncedFiles(a));
    const copy = `${FEN}/tokens/token-1.sync-conflict-20261004-120000-ABCDEFG.json`;

    await arrive(b, copy, editRecord(b, TOKEN_RECORD, (record) => { record.name = 'Losing edit'; }));
    await b.assets.reconcileWithVault();
    await b.assets.updateAsset('token-1', { tags: ['hag', 'boss'] });

    expect((await b.assets.getAssets('Fen', 'token')).map((token) => [token.id, token.name])).toEqual([['token-1', 'Bog hag']]);
    expect(b.files.has(copy)).toBe(true);
  });
});

describe('a device whose older version adopted art another device has a record for', () => {
  it('passes the user\'s edits of the adopted token to the record and points encounters at it', async () => {
    const a = await device(olderVault());
    const files = { ...syncedFiles(a), [CACHE]: olderVault()[CACHE]! };
    const index = JSON.parse(files[CACHE]!);
    delete index.assets['token-1'];
    index.assets['token-recovered-abc'] = { id: 'token-recovered-abc', type: 'token', name: 'Swamp witch', imagePath: ART, tags: ['boss'], statblockPath: 'Bestiary/Hag.md', collection: 'Fen', createdAt: 5, modifiedAt: 1_000_000 };
    index.assets['encounter-1'].tokens = [{ id: 'token-recovered-abc', name: 'Swamp witch', imagePath: ART }];
    files[CACHE] = JSON.stringify(index);

    const b = await device(files);

    expect(await b.assets.getAssetById('token-recovered-abc')).toBeNull();
    expect(await b.assets.getAssetById('token-1')).toMatchObject({ name: 'Swamp witch', tags: ['hag', 'boss'], statblockPath: 'Bestiary/Hag.md' });
    expect((await b.assets.getAssetById('encounter-1')) as { tokens: Array<{ id: string }> }).toMatchObject({ tokens: [{ id: 'token-1' }] });
  });

  it('passes no value rebuilding made: a name from the file and empty tags leave the record as it is', async () => {
    const a = await device(olderVault());
    const files = { ...syncedFiles(a), [CACHE]: olderVault()[CACHE]! };
    const index = JSON.parse(files[CACHE]!);
    delete index.assets['token-1'];
    // Tidied by an older version: renamed after its file, which stamped `modifiedAt`.
    index.assets['token-recovered-abc'] = { id: 'token-recovered-abc', type: 'token', name: 'Hag', imagePath: ART, tags: [], collection: 'Fen', createdAt: 5, modifiedAt: 1_000_000 };
    files[CACHE] = JSON.stringify(index);

    const b = await device(files);

    expect(await b.assets.getAssetById('token-1')).toMatchObject({ name: 'Bog hag', tags: ['hag'] });
  });
});

describe('a device that starts before sync delivered the library', () => {
  it('writes neither the collection nor the library it starts with, so the synced ones win', async () => {
    const b = await device({});

    expect(b.files.has('atlas-vtt/library.json')).toBe(false);
    expect([...b.files.keys()].some((path) => path.endsWith('collection.json'))).toBe(false);

    const a = await device(olderVault());
    for (const [path, content] of Object.entries(syncedFiles(a))) await arrive(b, path, content);
    await b.assets.reconcileWithVault();

    expect(b.assets.getDefaultCollectionId()).toBe('Fen');
    expect(await b.assets.getVaultId()).toBe('vault-a');
    expect(await b.assets.getAssetById('token-1')).not.toBeNull();
  });
});

describe('collection folders', () => {
  it('takes a copied collection folder in once it stood beside the original, with an identity of its own written to its file', async () => {
    const realClock = libraryClock.now;
    let now = 1_000_000;
    libraryClock.now = (): number => now;
    try {
      const a = await device(olderVault());
      const copied = 'atlas-vtt/collections/Fen copy/collection.json';
      await arrive(a, copied, a.files.get(`${FEN}/collection.json`)!);
      await a.assets.reconcileWithVault();
      // Until then it may be another device's rename arriving in halves.
      expect(JSON.parse(a.files.get(copied)!)).toMatchObject({ uid: 'uid-fen' });

      now += COPY_SETTLE_MS;
      await a.assets.reconcileWithVault();
      const uid = (await a.assets.getCollection('Fen copy'))?.uid;
      expect(uid).not.toBe('uid-fen');
      expect(JSON.parse(a.files.get(copied)!)).toMatchObject({ uid });
      expect((await a.assets.getCollection('Fen'))?.uid).toBe('uid-fen');

      const b = await device(syncedFiles(a));
      expect((await b.assets.getCollection('Fen copy'))?.uid).toBe(uid);
      a.assets.cancelScheduledChecks();
      b.assets.cancelScheduledChecks();
    } finally {
      libraryClock.now = realClock;
    }
  });
});
