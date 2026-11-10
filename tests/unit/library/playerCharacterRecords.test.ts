import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type TokenAsset } from '../../../src/app/services/AssetService';
import { RECORD_KEY } from '../../../src/app/services/library/recordFile';
import { assetFingerprint } from '../../../src/app/services/collectionBundle/fingerprints';
import { transferredRecord } from '../../../src/app/services/assetTransfer/transferRecords';
import type { TransferPlan } from '../../../src/app/services/assetTransfer/transferPlan';
import { isPlayerCharacter } from '../../../src/app/characters/playerCharacters';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const FEN = 'atlas-vtt/collections/Fen';
const ART = `${FEN}/tokens/ranger.webp`;
const TOKEN_RECORD = `${FEN}/tokens/token-1.json`;
const TOKEN: TokenAsset = { id: 'token-1', type: 'token', name: 'Ranger', imagePath: ART, tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1 };

interface Device extends InMemoryApp {
  assets: AssetService;
}

async function device(files: Record<string, string>): Promise<Device> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({ files, folders: ['atlas-vtt/collections'] });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { ...vault, assets };
}

/** A library as a device that wrote its files leaves it: the token's record file beside its art. */
function library(): Record<string, string> {
  return {
    'atlas-vtt/library.json': JSON.stringify({ defaultCollectionId: 'Fen', vaultId: 'vault-a' }),
    [`${FEN}/collection.json`]: JSON.stringify({ uid: 'uid-fen', version: 1, tags: {}, settings: {}, createdAt: 1, modifiedAt: 1 }),
    [ART]: 'IMG',
    [TOKEN_RECORD]: JSON.stringify({ [RECORD_KEY]: { format: 1, ...TOKEN } }, null, 2),
    [`${FEN}/tokens/bard.webp`]: 'IMG',
    [`${FEN}/tokens/token-2.json`]: JSON.stringify({ [RECORD_KEY]: { format: 1, ...TOKEN, id: 'token-2', name: 'Bard', imagePath: `${FEN}/tokens/bard.webp` } }, null, 2),
  };
}

const syncedFiles = (vault: InMemoryApp): Record<string, string> =>
  Object.fromEntries([...vault.files].filter(([path]) => !path.split('/').some((part) => part.startsWith('.'))));

const recordInFile = (vault: InMemoryApp): Record<string, unknown> => JSON.parse(vault.files.get(TOKEN_RECORD)!)[RECORD_KEY];

beforeEach(() => AssetService.resetInstance());

describe('a player character in the library', () => {
  it('is written to the token\'s record file as an edit, and removed from it again', async () => {
    const a = await device(library());

    await a.assets.setPlayerCharacters(['token-1'], true);
    expect(recordInFile(a)).toMatchObject({ id: 'token-1', playerCharacter: true });
    expect((recordInFile(a).modifiedAt as number)).toBeGreaterThan(1);

    await a.assets.setPlayerCharacters(['token-1'], false);
    expect(recordInFile(a)).not.toHaveProperty('playerCharacter');
    expect(await a.assets.getAssetById('token-1')).not.toHaveProperty('playerCharacter');
  });

  it('changes nothing for what is no token, or a token already so', async () => {
    const a = await device(library());
    await a.assets.setPlayerCharacters(['token-1'], false);
    await a.assets.setPlayerCharacters(['nothing'], true);
    expect(recordInFile(a).modifiedAt).toBe(1);
  });

  it('reaches a second device through the record file, both ways', async () => {
    const a = await device(library());
    await a.assets.setPlayerCharacters(['token-1'], true);
    const b = await device(syncedFiles(a));
    const onB = await b.assets.getAssetById('token-1');
    expect(onB?.type === 'token' && isPlayerCharacter(onB)).toBe(true);

    // Device A takes it back; its record file arrives the way a sync tool writes it.
    const file = JSON.parse(b.files.get(TOKEN_RECORD)!);
    delete file[RECORD_KEY].playerCharacter;
    file[RECORD_KEY].modifiedAt += 1;
    await b.app.vault.adapter.write(TOKEN_RECORD, JSON.stringify(file, null, 2));
    await b.assets.refreshMetadata();
    expect(await b.assets.getAssetById('token-1')).not.toHaveProperty('playerCharacter');
  });

  it('marks several tokens in one save', async () => {
    const a = await device(library());
    const saves = vi.spyOn(a.assets as unknown as { saveMetadata: () => Promise<void> }, 'saveMetadata');
    await a.assets.setPlayerCharacters(['token-1', 'token-2'], true);
    expect(saves).toHaveBeenCalledTimes(1);
    expect(JSON.parse(a.files.get(`${FEN}/tokens/token-2.json`)!)[RECORD_KEY]).toMatchObject({ playerCharacter: true });
  });

  it('is listed among the loaded tokens at once', async () => {
    const a = await device(library());
    await a.assets.setPlayerCharacters(['token-1'], true);
    expect(a.assets.loadedTokenAssets()).toContainEqual(expect.objectContaining({ id: 'token-1', playerCharacter: true }));
  });
});

describe('a player character in bundles and transfers', () => {
  it('changes the token\'s fingerprint, so an update tells it from an untouched token', async () => {
    expect(await assetFingerprint({ ...TOKEN, playerCharacter: true })).not.toBe(await assetFingerprint(TOKEN));
  });

  it('stays a player character when moved or copied to another collection', () => {
    const plan = { rewrites: new Map(), recordPaths: new Map() } as unknown as TransferPlan;
    const pc: TokenAsset = { ...TOKEN, playerCharacter: true };
    const moved = transferredRecord(pc, { targetCollectionId: 'Moor', newIds: new Map(), plan, now: 5 });
    const copied = transferredRecord(pc, { targetCollectionId: 'Moor', newIds: new Map([['token-1', 'token-2']]), plan, now: 5 });
    expect(moved).toMatchObject({ id: 'token-1', collection: 'Moor', playerCharacter: true });
    expect(copied).toMatchObject({ id: 'token-2', collection: 'Moor', playerCharacter: true });
  });
});
