// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService, type SoundAsset } from '../../../src/app/services/AssetService';
import { prepareCollectionExport } from '../../../src/app/services/collectionBundle/collectionExport';
import { FileReferenceService } from '../../../src/app/services/FileReferenceService';
import { importSoundFiles, recordVaultSounds, unrecordedAudio } from '../../../src/app/soundLibrary/soundImport';
import { soundRecordById, soundRecordsOf, updateSounds } from '../../../src/app/soundLibrary/soundRecords';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const SOUNDS = 'atlas-vtt/collections/Fen/sounds';
const secondsOf = async (): Promise<number> => 90;

let vault: InMemoryApp;
let assets: AssetService;

const deps = (): Parameters<typeof importSoundFiles>[0] => ({ app: vault.app, assetService: assets, secondsOf });
const fileNamed = (name: string, content = 'AUDIO'): File => new File([content], name);
const vaultFile = (path: string): TFile => vault.app.vault.getFileByPath(path)!;

async function soundAt(audioPath: string, collection = 'Fen'): Promise<SoundAsset> {
  const [sound] = await recordVaultSounds(deps(), [vaultFile(audioPath)], collection);
  return sound!;
}

beforeEach(async () => {
  vault = createInMemoryApp({ folders: ['atlas-vtt/collections'] });
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('Fen');
  await assets.createCollection('Hills');
});

describe('adding sounds from outside the vault', () => {
  it('stores each in the collection\'s sounds folder and records it, ambience by its name', async () => {
    const outcome = await importSoundFiles(deps(), [fileNamed('Rain loop.mp3'), fileNamed('Battle.flac')], 'Fen');
    expect(outcome.added.map((sound) => [sound.name, sound.kind, sound.audioPath])).toEqual([
      ['Rain loop', 'ambience', `${SOUNDS}/Rain loop.mp3`],
      ['Battle', 'music', `${SOUNDS}/Battle.flac`],
    ]);
    expect(vault.files.has(`${SOUNDS}/Rain loop.mp3`)).toBe(true);
    expect(outcome.added[0]).toMatchObject({ licence: 'unknown', streaming: 'unknown', tags: [], collection: 'Fen' });
    expect(vault.files.has(`${SOUNDS}/${outcome.added[0]!.id}.json`)).toBe(true);
  });

  it('refuses what is no audio and goes on', async () => {
    const outcome = await importSoundFiles(deps(), [fileNamed('map.png'), fileNamed('a.mp3')], 'Fen');
    expect(outcome.refused).toEqual(['map.png']);
    expect(outcome.added).toHaveLength(1);
  });

  it('the same file dropped twice is one file and one record', async () => {
    await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    const again = await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    expect(again.added).toEqual([]);
    expect((await assets.getAssets('Fen', 'sound'))).toHaveLength(1);
    expect(vault.files.has(`${SOUNDS}/a-2.mp3`)).toBe(false);
  });

  it('another file of that name takes a free one', async () => {
    await importSoundFiles(deps(), [fileNamed('a.mp3', 'ONE')], 'Fen');
    const other = await importSoundFiles(deps(), [fileNamed('a.mp3', 'LONGER')], 'Fen');
    expect(other.added[0]?.audioPath).toBe(`${SOUNDS}/a-2.mp3`);
  });

  it('cleans a name a file cannot carry', async () => {
    const { added } = await importSoundFiles(deps(), [fileNamed('..a:b#c.mp3')], 'Fen');
    expect(added[0]?.audioPath).toBe(`${SOUNDS}/a-b-c.mp3`);
  });

  it('takes the file back when its record cannot be saved, and reports it', async () => {
    const refuse = vi.spyOn(assets, 'addAsset').mockRejectedValueOnce(new Error('disk full'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const outcome = await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    expect(outcome.failed).toEqual(['a.mp3']);
    expect(vault.app.fileManager.trashFile).toHaveBeenCalled();
    refuse.mockRestore();
    quiet.mockRestore();
  });

  it('holds the index while it writes, so the vault check never sees the file alone', async () => {
    const run = vi.spyOn(assets, 'runExclusive');
    await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('recording what the vault already holds', () => {
  beforeEach(async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    await vault.app.vault.create('Library/Battle.ogg', 'AUDIO');
    await vault.app.vault.create('Library/Notes.md', 'text');
  });

  it('never copies a file: the record names it where it lies', async () => {
    const before = [...vault.files.keys()].filter((path) => !path.endsWith('.json'));
    const sound = await soundAt('Library/Rain.mp3');
    expect(sound.audioPath).toBe('Library/Rain.mp3');
    expect([...vault.files.keys()].filter((path) => !path.endsWith('.json'))).toEqual(before);
    expect(vault.app.vault.createBinary).not.toHaveBeenCalled();
  });

  it('a file recorded already stays as it is', async () => {
    await soundAt('Library/Rain.mp3');
    expect(await recordVaultSounds(deps(), [vaultFile('Library/Rain.mp3')], 'Fen')).toEqual([]);
    expect(await assets.getAssets('Fen', 'sound')).toHaveLength(1);
  });

  it('saves the index once for many', async () => {
    const write = vi.spyOn(assets, 'addAssets');
    await recordVaultSounds(deps(), [vaultFile('Library/Rain.mp3'), vaultFile('Library/Battle.ogg')], 'Fen');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('lists the audio a collection has no sound for', async () => {
    await soundAt('Library/Rain.mp3');
    expect((await unrecordedAudio(vault.app, assets, 'Fen')).map((file) => file.path)).toEqual(['Library/Battle.ogg']);
    expect((await unrecordedAudio(vault.app, assets, 'Hills')).map((file) => file.path)).toEqual(['Library/Battle.ogg', 'Library/Rain.mp3']);
  });

  it('counts only the collection\'s music folder where asked, and a video map is no sound', async () => {
    await vault.app.vault.create('atlas-vtt/collections/Fen/music/Old.mp3', 'AUDIO');
    await vault.app.vault.create('atlas-vtt/collections/Fen/music/deep/Older.ogg', 'AUDIO');
    await vault.app.vault.create('atlas-vtt/assets/flow.webm', 'VIDEO');
    await assets.addAsset({ type: 'map', name: 'Flow', collection: 'Fen', tags: [], mapFilePath: 'atlas-vtt/assets/flow.webm' });
    const inMusic = await unrecordedAudio(vault.app, assets, 'Fen', 'atlas-vtt/collections/Fen/music');
    expect(inMusic.map((file) => file.path).sort()).toEqual(['atlas-vtt/collections/Fen/music/Old.mp3', 'atlas-vtt/collections/Fen/music/deep/Older.ogg']);
    expect((await unrecordedAudio(vault.app, assets, 'Fen')).map((file) => file.path)).not.toContain('atlas-vtt/assets/flow.webm');
  });
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
    const { added } = await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    await assets.renameCollection('Fen', 'Marsh');
    const [sound] = await soundRecordsOf(assets, 'Marsh');
    expect(sound?.id).toBe(added[0]?.id);
    expect(sound?.filePath).toBe('atlas-vtt/collections/Marsh/sounds/a.mp3');
  });
});

describe('deleting a sound', () => {
  it('takes the audio Atlas put in the collection\'s folder', async () => {
    const { added } = await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    await assets.deleteAsset(added[0]!.id);
    expect(vault.app.fileManager.trashFile).toHaveBeenCalledWith(expect.objectContaining({ path: `${SOUNDS}/a.mp3` }));
    expect(await assets.getAssetById(added[0]!.id)).toBeNull();
  });

  it('leaves the GM\'s own file where it lies', async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    const sound = await soundAt('Library/Rain.mp3');
    await assets.deleteAsset(sound.id);
    expect(vault.files.has('Library/Rain.mp3')).toBe(true);
  });

  it('leaves the audio another record still names', async () => {
    const { added } = await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    await recordVaultSounds(deps(), [vaultFile(`${SOUNDS}/a.mp3`)], 'Hills');
    await assets.deleteAsset(added[0]!.id);
    expect(vault.files.has(`${SOUNDS}/a.mp3`)).toBe(true);
  });
});

describe('changing sounds', () => {
  it('changes all named in one save, and a field set to undefined goes', async () => {
    const { added } = await importSoundFiles(deps(), [fileNamed('a.mp3'), fileNamed('b.mp3'), fileNamed('c.mp3')], 'Fen');
    const [a, b, c] = added;
    await updateSounds(assets, [a!.id, b!.id], { kind: 'ambience', trimDb: -2, credit: 'X' }, 99);
    expect(await soundRecordById(assets, a!.id)).toMatchObject({ kind: 'ambience', trimDb: -2, credit: 'X' });
    expect((await soundRecordById(assets, c!.id))?.kind).toBe('music');
    expect((await assets.getAssetById(a!.id))?.modifiedAt).toBe(99);
    await updateSounds(assets, [a!.id], { credit: undefined, trimDb: undefined });
    const record = await soundRecordById(assets, a!.id);
    expect('credit' in record!).toBe(false);
    expect('trimDb' in record!).toBe(false);
  });
});

describe('bundles', () => {
  it('leave sounds and moods out', async () => {
    const { added } = await importSoundFiles(deps(), [fileNamed('a.mp3')], 'Fen');
    await vault.app.vault.adapter.write('atlas-vtt/collections/Fen/moods/m.json', JSON.stringify({ id: 'm', name: 'M', order: 1, music: { tracks: [added[0]!.id] } }));
    const preview = await prepareCollectionExport(vault.app, assets, 'Fen');
    expect(preview.assets.filter((asset) => asset.type === 'sound')).toEqual([]);
    expect(preview.files.filter((file) => /\/(sounds|moods)\//.test(file.vaultPath) || file.vaultPath.endsWith('.mp3'))).toEqual([]);
    expect(preview.missing).toEqual([]);
  });
});
