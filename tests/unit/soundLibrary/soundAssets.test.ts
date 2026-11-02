// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService, type SoundAsset } from '../../../src/app/services/AssetService';
import { prepareCollectionExport } from '../../../src/app/services/collectionBundle/collectionExport';
import { FileReferenceService } from '../../../src/app/services/FileReferenceService';
import type { SoundRecord } from '../../../src/app/sound/soundTypes';
import { soundRecordOf, soundRecordsOf, updateSounds } from '../../../src/app/soundLibrary/soundRecords';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const SOUNDS = 'atlas-vtt/collections/Fen/sounds';

let vault: InMemoryApp;
let assets: AssetService;

async function soundAt(audioPath: string, collection = 'Fen'): Promise<SoundAsset> {
  return await assets.addAsset({ type: 'sound', name: 'Sound', tags: [], collection, audioPath, kind: 'music', licence: 'unknown', streaming: 'unknown' }) as SoundAsset;
}

async function soundIn(name: string): Promise<SoundAsset> {
  await vault.app.vault.create(`${SOUNDS}/${name}`, 'AUDIO');
  return soundAt(`${SOUNDS}/${name}`);
}

async function soundRecordById(service: AssetService, id: string): Promise<SoundRecord | null> {
  const asset = await service.getAssetById(id);
  return asset?.type === 'sound' ? soundRecordOf(asset) : null;
}

beforeEach(async () => {
  vault = createInMemoryApp({ folders: ['atlas-vtt/collections'] });
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('Fen');
  await assets.createCollection('Hills');
});

describe('the vault check and a sound', () => {
  it('a record whose file is gone stays, also once the deletion was seen', async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    const sound = await soundAt('Library/Rain.mp3');
    vault.files.delete('Library/Rain.mp3');
    await assets.reconcileWithVault(new Set(['Library/Rain.mp3']));
    expect(await soundRecordById(assets, sound.id)).toMatchObject({ filePath: 'Library/Rain.mp3' });
  });

  it('a record delivered before its file stays and finds the file when it comes', async () => {
    const id = 'sound-from-elsewhere';
    const envelope = { format: 1, id, type: 'sound', name: 'Long', tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1, audioPath: `${SOUNDS}/long.mp3`, kind: 'music', licence: 'unknown', streaming: 'unknown' };
    await vault.app.vault.adapter.write(`${SOUNDS}/${id}.json`, JSON.stringify({ atlasRecord: envelope }));
    await assets.reconcileWithVault();
    expect((await soundRecordById(assets, id))?.filePath).toBe(`${SOUNDS}/long.mp3`);
    expect(vault.app.vault.getFileByPath(`${SOUNDS}/long.mp3`)).toBeNull();
    await vault.app.vault.adapter.write(`${SOUNDS}/long.mp3`, 'AUDIO');
    await assets.reconcileWithVault();
    expect((await soundRecordById(assets, id))?.filePath).toBe(`${SOUNDS}/long.mp3`);
  });

  it('a file moved where Atlas could not see it is found by its name', async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    const sound = await soundAt('Library/Rain.mp3');
    vault.files.delete('Library/Rain.mp3');
    await vault.app.vault.adapter.write('Elsewhere/Rain.mp3', 'AUDIO');
    await assets.reconcileWithVault();
    expect((await soundRecordById(assets, sound.id))?.filePath).toBe('Elsewhere/Rain.mp3');
  });

  it('its record places it: audio in another collection\'s folder leaves it where it is', async () => {
    await vault.app.vault.create('atlas-vtt/collections/Hills/music/Old.mp3', 'AUDIO');
    const sound = await soundAt('atlas-vtt/collections/Hills/music/Old.mp3');
    await assets.reconcileWithVault();
    expect((await assets.getAssetById(sound.id))?.collection).toBe('Fen');
    expect(vault.files.has(`${SOUNDS}/${sound.id}.json`)).toBe(true);
  });

  it('takes nothing from the moods folder for an asset', async () => {
    await vault.app.vault.adapter.write('atlas-vtt/collections/Fen/moods/m.json', JSON.stringify({ id: 'm', name: 'M', order: 1 }));
    await assets.reconcileWithVault();
    expect((await assets.getAssets('Fen')).filter((asset) => asset.id === 'm')).toEqual([]);
  });

  it('adopts no audio file by itself: only the GM records a file', async () => {
    await vault.app.vault.adapter.write(`${SOUNDS}/stray.mp3`, 'AUDIO');
    await assets.reconcileWithVault();
    expect(await assets.getAssets('Fen', 'sound')).toEqual([]);
  });
});

describe('renames', () => {
  it('a renamed file carries its record along', async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    const sound = await soundAt('Library/Rain.mp3');
    await new FileReferenceService(vault.app).handleFileRenamed('Library/Rain.mp3', 'Library/Storm.mp3');
    expect((await soundRecordById(assets, sound.id))?.filePath).toBe('Library/Storm.mp3');
  });

  it('a renamed collection keeps its sounds, audio inside its folder following', async () => {
    const { id } = await soundIn('a.mp3');
    await assets.renameCollection('Fen', 'Marsh');
    const [sound] = await soundRecordsOf(assets, 'Marsh');
    expect(sound?.id).toBe(id);
    expect(sound?.filePath).toBe('atlas-vtt/collections/Marsh/sounds/a.mp3');
  });
});

describe('deleting a sound', () => {
  it.each(['Library/Rain.mp3', `${SOUNDS}/Rain.mp3`])('takes the record and leaves the file %s where it lies', async (path) => {
    await vault.app.vault.create(path, 'AUDIO');
    const sound = await soundAt(path);
    await assets.deleteAsset(sound.id);
    expect(await assets.getAssetById(sound.id)).toBeNull();
    expect(vault.files.has(path)).toBe(true);
  });
});

describe('changing sounds', () => {
  it('changes all named in one save, and a field set to undefined goes', async () => {
    const a = await soundIn('a.mp3');
    const b = await soundIn('b.mp3');
    const c = await soundIn('c.mp3');
    await updateSounds(assets, [a.id, b.id], { kind: 'ambience', trimDb: -2, credit: 'X' }, 99);
    expect(await soundRecordById(assets, a.id)).toMatchObject({ kind: 'ambience', trimDb: -2, credit: 'X' });
    expect((await soundRecordById(assets, c.id))?.kind).toBe('music');
    expect((await assets.getAssetById(a.id))?.modifiedAt).toBe(99);
    await updateSounds(assets, [a.id], { credit: undefined, trimDb: undefined });
    const record = await soundRecordById(assets, a.id);
    expect('credit' in record!).toBe(false);
    expect('trimDb' in record!).toBe(false);
  });
});

describe('bundles', () => {
  it('leave sounds and moods out', async () => {
    const { id } = await soundIn('a.mp3');
    await vault.app.vault.adapter.write('atlas-vtt/collections/Fen/moods/m.json', JSON.stringify({ id: 'm', name: 'M', order: 1, music: { tracks: [id] } }));
    const preview = await prepareCollectionExport(vault.app, assets, 'Fen');
    expect(preview.assets.filter((asset) => asset.type === 'sound')).toEqual([]);
    expect(preview.files.filter((file) => /\/(sounds|moods)\//.test(file.vaultPath) || file.vaultPath.endsWith('.mp3'))).toEqual([]);
    expect(preview.missing).toEqual([]);
  });
});
