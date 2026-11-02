import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService, type SoundAsset } from '../../../src/app/services/AssetService';
import type { SoundKind } from '../../../src/app/sound/soundTypes';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import { editFiles, recordIdFor, recordOfFile, recordsForFiles, unrecordedSound } from '../../../src/app/soundLibrary/libraryRecords';
import { importIntoLibrary, makeLibraryFolder, moveEntries, renameEntry, trashEntries, usesOf, type LibraryContext } from '../../../src/app/soundLibrary/libraryOperations';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { relinkRecords } from '../../../src/app/soundLibrary/soundRelink';
import { SoundLibrary, type LibraryFile } from '../../../src/app/soundLibrary/SoundLibrary';
import { soundRecordOf } from '../../../src/app/soundLibrary/soundRecords';
import { TrashUnavailableError } from '../../../src/app/soundLibrary/soundLocation';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

let base: string;
let vault: InMemoryApp;
let assets: AssetService;
let library: SoundLibrary;
let context: LibraryContext;
let canTrash: boolean;

const external = (name: string): string => path.join(base, name);

function write(root: string, relative: string, content = 'AUDIO'): void {
  fs.mkdirSync(path.dirname(path.join(external(root), relative)), { recursive: true });
  fs.writeFileSync(path.join(external(root), relative), content);
}

function fileOf(kind: SoundKind, relative: string, size = 5): LibraryFile {
  return { kind, path: relative, name: path.basename(relative), size, mtime: 1 };
}

async function open(local: Partial<Record<SoundKind, string>>, shared: SharedSoundRoots): Promise<void> {
  const roots = new SoundRoots({
    shared: () => shared,
    setShared: (next) => { shared = next; },
    onSharedChange: () => () => undefined,
    local: (kind) => local[kind] ?? null,
    setLocal: (kind, value) => { if (value) local[kind] = value; else delete local[kind]; },
    vaultBase: () => '/vault',
    realPath: async (value) => value,
  });
  library = new SoundLibrary({
    roots,
    open: (root) => (root.status === 'vault' ? new VaultLocation(vault.app, root.path) : new ExternalLocation(root.path, {
      files: { fs: fs as unknown as NodeFsModule, sep: path.sep, home: base },
      trashItem: canTrash ? async (absolute) => fs.rmSync(absolute, { recursive: true }) : null,
      resourceUrl: null,
    })),
    home: () => base,
  });
  context = { library, assets };
}

beforeEach(async () => {
  vi.stubGlobal('window', globalThis);
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sound-ops-'));
  fs.mkdirSync(external('Music'));
  fs.mkdirSync(external('Ambience'));
  canTrash = true;
  vault = createInMemoryApp({ folders: ['atlas-vtt/collections', 'Audio'] });
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('Fen');
  await assets.createCollection('Hills');
  await open({ music: external('Music'), ambience: external('Ambience') }, {});
});

afterEach(() => {
  library.destroy();
  assets.cancelScheduledChecks();
  fs.rmSync(base, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const soundsNow = (): Promise<SoundAsset[]> => assets.getAssets(undefined, 'sound');

describe('records', () => {
  it('are made only when a file enters a mix or is edited: an unrecorded sound writes nothing', async () => {
    const file = fileOf('music', 'Battle/a.mp3');
    const sound = unrecordedSound(file, 'atlas-sound:music/Battle/a.mp3', 'Fen');
    expect(sound).toMatchObject({ name: 'a', kind: 'music', filePath: 'atlas-sound:music/Battle/a.mp3', id: recordIdFor('Fen', 'atlas-sound:music/Battle/a.mp3') });
    expect(await soundsNow()).toEqual([]);
  });

  it('take their kind from the root and read as sound records', async () => {
    const [made] = await recordsForFiles(assets, library, [fileOf('ambience', 'Weather/Rain.ogg')], 'Fen');
    expect(made).toMatchObject({ kind: 'ambience', filePath: 'atlas-sound:ambience/Weather/Rain.ogg', name: 'Rain' });
    const [stored] = await soundsNow();
    expect(soundRecordOf(stored!).filePath).toBe('atlas-sound:ambience/Weather/Rain.ogg');
    expect(stored!.audioSize).toBe(5);
  });

  it('are not made twice in a collection', async () => {
    const [first] = await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    const [second] = await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    expect(second?.id).toBe(first?.id);
    expect(await soundsNow()).toHaveLength(1);
  });

  it('are one per collection for a file used from two, and neither is lost', async () => {
    const [fen] = await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    const [hills] = await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Hills');
    expect(hills?.id).not.toBe(fen?.id);
    const sounds = await soundsNow();
    expect(sounds.map((sound) => sound.collection).sort()).toEqual(['Fen', 'Hills']);
    expect(recordOfFile(sounds, 'atlas-sound:music/a.mp3', 'Hills')?.id).toBe(hills?.id);
    expect(recordOfFile(sounds, 'atlas-sound:music/a.mp3', 'Other')?.id).toBe(sounds.slice().sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0]?.id);
  });

  it('an edit reaches every record of the file, and makes the first where there is none', async () => {
    await editFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen', { credit: 'Someone' });
    await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Hills');
    await editFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen', { trimDb: -3 });
    const sounds = await soundsNow();
    expect(sounds).toHaveLength(2);
    expect(sounds.every((sound) => sound.trimDb === -3)).toBe(true);
    expect(sounds.find((sound) => sound.collection === 'Fen')?.credit).toBe('Someone');
  });
});

describe('moving and renaming', () => {
  it('carries records with a file, the mood that names one still finds it', async () => {
    write('Music', 'a.mp3');
    fs.mkdirSync(path.join(external('Music'), 'Battle'));
    const [made] = await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    const moods = MoodStore.forApp(vault.app);
    const mood = moods.createMood('Fen', { name: 'Fight', fadeSeconds: 2, music: { tracks: [made!.id], shuffle: false, levelDb: 0 }, layers: [] });
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3', isFolder: false }], 'music', 'Battle');
    expect(fs.existsSync(path.join(external('Music'), 'Battle/a.mp3'))).toBe(true);
    const [sound] = await soundsNow();
    expect(sound).toMatchObject({ id: made!.id, audioPath: 'atlas-sound:music/Battle/a.mp3' });
    const stored = moods.mood('Fen', mood.id);
    expect(stored?.music).toMatchObject({ tracks: [made!.id] });
    await moods.flush();
    MoodStore.release(vault.app);
  });

  it('carries every record below a folder, and a rename the name that came from the file', async () => {
    write('Music', 'Old/a.mp3');
    write('Music', 'Old/Deep/b.mp3');
    write('Music', 'Older/c.mp3');
    await recordsForFiles(assets, library, [fileOf('music', 'Old/a.mp3'), fileOf('music', 'Old/Deep/b.mp3'), fileOf('music', 'Older/c.mp3')], 'Fen');
    await renameEntry(context, { kind: 'music', path: 'Old', isFolder: true }, 'New');
    expect((await soundsNow()).map((sound) => sound.audioPath).sort()).toEqual(['atlas-sound:music/New/Deep/b.mp3', 'atlas-sound:music/New/a.mp3', 'atlas-sound:music/Older/c.mp3']);
    await renameEntry(context, { kind: 'music', path: 'New/a.mp3', isFolder: false }, 'z.mp3');
    expect((await soundsNow()).find((sound) => sound.audioPath.endsWith('z.mp3'))?.name).toBe('z');
  });

  it('numbers a name that is taken and never replaces a file', async () => {
    write('Music', 'a.mp3', 'ONE');
    write('Music', 'Battle/a.mp3', 'TWO');
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3', isFolder: false }], 'music', 'Battle');
    expect(fs.readFileSync(path.join(external('Music'), 'Battle/a.mp3'), 'utf8')).toBe('TWO');
    expect(fs.readFileSync(path.join(external('Music'), 'Battle/a 2.mp3'), 'utf8')).toBe('ONE');
  });

  it('does not move a folder into itself', async () => {
    write('Music', 'Old/a.mp3');
    await moveEntries(context, [{ kind: 'music', path: 'Old', isFolder: true }], 'music', 'Old/Deep');
    expect(fs.existsSync(path.join(external('Music'), 'Old/a.mp3'))).toBe(true);
  });

  it('changes a file\'s kind when it moves to the other root', async () => {
    write('Music', 'a.mp3');
    await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3', isFolder: false }], 'ambience', '');
    expect(fs.existsSync(path.join(external('Ambience'), 'a.mp3'))).toBe(true);
    expect(fs.existsSync(path.join(external('Music'), 'a.mp3'))).toBe(false);
    expect(await soundsNow()).toMatchObject([{ kind: 'ambience', audioPath: 'atlas-sound:ambience/a.mp3' }]);
  });

  it('moves a whole folder between a disk and the vault, and the records follow', async () => {
    await open({ music: external('Music') }, { music: { type: 'external' }, ambience: { type: 'vault', path: 'Audio' } });
    write('Music', 'Set/a.mp3', 'AAA');
    write('Music', 'Set/Deep/b.mp3', 'BBB');
    await recordsForFiles(assets, library, [fileOf('music', 'Set/a.mp3'), fileOf('music', 'Set/Deep/b.mp3')], 'Fen');
    await moveEntries(context, [{ kind: 'music', path: 'Set', isFolder: true }], 'ambience', '');
    expect(vault.files.get('Audio/Set/a.mp3')).toBe('AAA');
    expect(vault.files.get('Audio/Set/Deep/b.mp3')).toBe('BBB');
    expect(fs.existsSync(path.join(external('Music'), 'Set'))).toBe(false);
    expect((await soundsNow()).map((sound) => [sound.audioPath, sound.kind]).sort()).toEqual([['Audio/Set/Deep/b.mp3', 'ambience'], ['Audio/Set/a.mp3', 'ambience']]);
  });

  it('within the vault goes through fileManager, between roots too', async () => {
    await open({}, { music: { type: 'vault', path: 'Music' }, ambience: { type: 'vault', path: 'Audio' } });
    await vault.app.vault.createFolder('Music');
    await vault.app.vault.adapter.write('Music/a.mp3', 'A');
    await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3', isFolder: false }], 'ambience', '');
    expect(vault.app.fileManager.renameFile).toHaveBeenCalledTimes(1);
    expect(vault.files.has('Audio/a.mp3')).toBe(true);
    expect(await soundsNow()).toMatchObject([{ kind: 'ambience', audioPath: 'Audio/a.mp3' }]);
  });

  it('a failed save of the records puts the file back', async () => {
    write('Music', 'a.mp3');
    fs.mkdirSync(path.join(external('Music'), 'Battle'));
    const rewrite = vi.spyOn(assets, 'rewriteAssets').mockRejectedValueOnce(new Error('disk full'));
    await expect(moveEntries(context, [{ kind: 'music', path: 'a.mp3', isFolder: false }], 'music', 'Battle')).rejects.toThrow('disk full');
    rewrite.mockRestore();
    expect(fs.existsSync(path.join(external('Music'), 'a.mp3'))).toBe(true);
    expect(fs.existsSync(path.join(external('Music'), 'Battle/a.mp3'))).toBe(false);
  });
});

describe('a file gone from its path', () => {
  it('is found by name and size in its root, and otherwise waits', async () => {
    write('Music', 'a.mp3', '12345');
    write('Music', 'b.mp3', '12345');
    await recordsForFiles(assets, library, [fileOf('music', 'a.mp3'), fileOf('music', 'b.mp3'), fileOf('music', 'c.mp3')], 'Fen');
    const [, b] = await soundsNow();
    fs.mkdirSync(path.join(external('Music'), 'Moved'));
    fs.renameSync(path.join(external('Music'), 'a.mp3'), path.join(external('Music'), 'Moved/a.mp3'));
    fs.rmSync(path.join(external('Music'), 'b.mp3'));
    fs.writeFileSync(path.join(external('Music'), 'b-other-size.mp3'), 'XX');
    expect(library.statOfExternal('atlas-sound:music/a.mp3')).toBeNull();
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.isWalked('music')).toBe(true));
    expect(await relinkRecords(library, assets, 'music')).toBe(true);
    const sounds = await soundsNow();
    expect(sounds.map((sound) => sound.audioPath).sort()).toEqual(['atlas-sound:music/Moved/a.mp3', 'atlas-sound:music/b.mp3', 'atlas-sound:music/c.mp3']);
    expect(sounds.find((sound) => sound.id === b!.id)?.audioPath).toBe(b!.audioPath);
  });

  it('on a device without the root waits, and nothing fails', async () => {
    await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    await open({}, { music: { type: 'external' } });
    expect(library.rootOf('music').status).toBe('not-linked-here');
    expect(library.listing('music', '')).toBeNull();
    expect(library.statOfExternal('atlas-sound:music/a.mp3')).toBeNull();
    await expect(library.readExternal('atlas-sound:music/a.mp3')).rejects.toThrow('not reachable');
    await expect(relinkRecords(library, assets, 'music')).resolves.toBe(false);
    expect(await soundsNow()).toHaveLength(1);
  });
});

describe('deleting', () => {
  it('names the moods that use it, and takes the records along', async () => {
    write('Music', 'Set/a.mp3');
    const [made] = await recordsForFiles(assets, library, [fileOf('music', 'Set/a.mp3')], 'Fen');
    const moods = MoodStore.forApp(vault.app);
    await moods.whenLoaded('Fen');
    await moods.whenLoaded('Hills');
    moods.createMood('Fen', { name: 'Fight', fadeSeconds: 2, music: 'none', layers: [{ sound: made!.id, levelDb: 0 }] });
    const entries = [{ kind: 'music' as const, path: 'Set', isFolder: true }];
    const uses = await usesOf(context, moods, entries);
    expect(uses.moods).toBe(1);
    expect(uses.sounds.map((sound) => sound.id)).toEqual([made!.id]);
    await trashEntries(context, entries, uses.sounds);
    expect(fs.existsSync(path.join(external('Music'), 'Set'))).toBe(false);
    expect(await soundsNow()).toEqual([]);
    await moods.flush();
    MoodStore.release(vault.app);
  });

  it('is refused without a trash, and everything stays', async () => {
    canTrash = false;
    await open({ music: external('Music') }, {});
    write('Music', 'a.mp3');
    await recordsForFiles(assets, library, [fileOf('music', 'a.mp3')], 'Fen');
    const entries = [{ kind: 'music' as const, path: 'a.mp3', isFolder: false }];
    await expect(trashEntries(context, entries, await soundsNow())).rejects.toBeInstanceOf(TrashUnavailableError);
    expect(fs.existsSync(path.join(external('Music'), 'a.mp3'))).toBe(true);
    expect(await soundsNow()).toHaveLength(1);
  });
});

describe('importing', () => {
  it('copies into the open folder under a free name, and makes no record', async () => {
    write('Music', 'Battle/a.mp3', 'OLD');
    const outcome = await importIntoLibrary(library, [new File(['NEW'], 'a.mp3'), new File(['X'], 'cover.png')], 'music', 'Battle');
    expect(outcome).toEqual({ added: ['a 2.mp3'], refused: ['cover.png'], failed: [] });
    expect(fs.readFileSync(path.join(external('Music'), 'Battle/a.mp3'), 'utf8')).toBe('OLD');
    expect(fs.readFileSync(path.join(external('Music'), 'Battle/a 2.mp3'), 'utf8')).toBe('NEW');
    expect(await soundsNow()).toEqual([]);
  });

  it('with nothing linked goes to the default vault folder, which is then linked', async () => {
    await open({}, {});
    const outcome = await importIntoLibrary(library, [new File(['NEW'], 'a.mp3')], 'ambience', '');
    expect(outcome.added).toEqual(['a.mp3']);
    expect(vault.files.get('atlas-vtt/sounds/ambience/a.mp3')).toBe('NEW');
    expect(library.rootOf('ambience')).toMatchObject({ status: 'vault', path: 'atlas-vtt/sounds/ambience' });
  });

  it('is refused for a root linked only on another device', async () => {
    await open({}, { music: { type: 'external' } });
    const outcome = await importIntoLibrary(library, [new File(['NEW'], 'a.mp3')], 'music', '');
    expect(outcome.failed).toEqual(['a.mp3']);
    expect(vault.files.has('atlas-vtt/sounds/music/a.mp3')).toBe(false);
  });
});

describe('browsing', () => {
  it('lists lazily, counts and searches in the background, and stays right after changes', async () => {
    write('Music', 'Battle/a.mp3');
    write('Music', 'Battle/Bosses/b.mp3');
    write('Music', 'Travel/Road song.mp3');
    write('Ambience', 'Rain.ogg');
    expect(library.listing('music', '')).toBeNull();
    await vi.waitFor(() => expect(library.listing('music', '')).not.toBeNull());
    expect(library.countOf('music', 'Battle')).toBeNull();
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.isWalked('music') && library.isWalked('ambience')).toBe(true));
    expect(library.countOf('music', '')).toBe(3);
    expect(library.countOf('music', 'Battle')).toBe(2);
    expect(library.search('road').map((file) => file.path)).toEqual(['Travel/Road song.mp3']);
    expect(library.search('rain')).toMatchObject([{ kind: 'ambience', path: 'Rain.ogg' }]);
    write('Music', 'Battle/c.mp3');
    await library.settle('music', ['Battle/c.mp3']);
    expect(library.countOf('music', 'Battle')).toBe(3);
    fs.rmSync(path.join(external('Music'), 'Battle'), { recursive: true });
    await library.settle('music', ['Battle']);
    expect(library.countOf('music', '')).toBe(1);
    expect(library.search('bosses')).toEqual([]);
  });

  it('keeps a listing object while nothing changed', async () => {
    write('Music', 'a.mp3');
    library.listing('music', '');
    await vi.waitFor(() => expect(library.listing('music', '')).not.toBeNull());
    const first = library.listing('music', '');
    await library.settle('music', ['a.mp3']);
    expect(library.listing('music', '')).toBe(first);
  });

  it('searches 20,000 names inside a frame', async () => {
    const entries = Array.from({ length: 20_000 }, (_, index) => ({ name: `Track ${index}.mp3`, path: `Folder ${index % 200}/Track ${index}.mp3`, size: 5, mtime: 1 }));
    const location = new VaultLocation(vault.app, 'Audio');
    vi.spyOn(location, 'list').mockImplementation(async (folder) => (folder === '' ? { folders: [], files: entries } : null));
    const big = new SoundLibrary({ roots: library.roots, open: () => location, home: () => null });
    big.rescan(100_000);
    await vi.waitFor(() => expect(big.isWalked('music')).toBe(true));
    big.search('warm');
    const start = performance.now();
    const hits = big.search('track 19999');
    expect(performance.now() - start).toBeLessThan(16);
    expect(hits.map((hit) => hit.kind)).toEqual(['music', 'ambience']);
    big.destroy();
  });
});

it('a folder is made under a free name', async () => {
  write('Music', 'Battle/a.mp3');
  await makeLibraryFolder(context, 'music', '', 'Battle');
  expect(fs.existsSync(path.join(external('Music'), 'Battle 2'))).toBe(true);
});

it('reading the vault lists audio only, in reading order, and TFile sizes', async () => {
  await vault.app.vault.createFolder('Audio/Deep');
  await vault.app.vault.adapter.write('Audio/Track 10.mp3', 'A');
  await vault.app.vault.adapter.write('Audio/Track 2.mp3', 'A');
  await vault.app.vault.adapter.write('Audio/notes.md', 'A');
  const listing = await new VaultLocation(vault.app, 'Audio').list('');
  expect(listing?.folders.map((folder) => folder.name)).toEqual(['Deep']);
  expect(listing?.files.map((file) => file.name)).toEqual(['Track 2.mp3', 'Track 10.mp3']);
});
