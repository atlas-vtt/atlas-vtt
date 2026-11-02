import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundKind } from '../../../src/app/sound/soundTypes';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import { editFiles, recordIdFor, recordsByFile, recordsForFiles, soundOfFile, standingRecord, unrecordedSound } from '../../../src/app/soundLibrary/libraryRecords';
import { importIntoLibrary, moveEntries, renameEntry, trashEntries, usesOf, type LibraryContext } from '../../../src/app/soundLibrary/libraryOperations';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { SoundLibrary, type LibraryFile } from '../../../src/app/soundLibrary/SoundLibrary';
import { soundRecordOf, type StoredSound } from '../../../src/app/soundLibrary/soundRecords';
import { SoundRecordStore } from '../../../src/app/soundLibrary/SoundRecordStore';
import { TrashUnavailableError } from '../../../src/app/soundLibrary/soundLocation';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

let base: string;
let vault: InMemoryApp;
let records: SoundRecordStore;
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
      vaultFolder: null,
    })),
    home: () => base,
    probeSeconds: async () => null,
  });
  context = { library, records };
}

beforeEach(async () => {
  vi.stubGlobal('window', globalThis);
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sound-ops-'));
  fs.mkdirSync(external('Music'));
  fs.mkdirSync(external('Ambience'));
  canTrash = true;
  vault = createInMemoryApp({ folders: ['Audio'] });
  records = SoundRecordStore.forApp(vault.app);
  await records.whenLoaded();
  await open({ music: external('Music'), ambience: external('Ambience') }, {});
});

afterEach(() => {
  library.destroy();
  SoundRecordStore.release(vault.app);
  fs.rmSync(base, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const soundsNow = (): readonly StoredSound[] => records.all();

describe('records', () => {
  it('are made only when a file enters a mix or is edited: an unrecorded sound writes nothing', async () => {
    const file = fileOf('music', 'Battle/a.mp3');
    const sound = unrecordedSound(file, 'atlas-sound:music/Battle/a.mp3');
    expect(sound).toMatchObject({ name: 'a', kind: 'music', filePath: 'atlas-sound:music/Battle/a.mp3', id: recordIdFor('atlas-sound:music/Battle/a.mp3') });
    expect(soundsNow()).toEqual([]);
  });

  it('take their kind from the root and read as sound records', async () => {
    const [made] = await recordsForFiles(records, library, [fileOf('ambience', 'Weather/Rain.ogg')]);
    expect(made).toMatchObject({ kind: 'ambience', filePath: 'atlas-sound:ambience/Weather/Rain.ogg', name: 'Rain' });
    const [stored] = soundsNow();
    expect(soundRecordOf(stored!).filePath).toBe('atlas-sound:ambience/Weather/Rain.ogg');
    expect(stored!.audioSize).toBe(5);
  });

  it('are not made twice', async () => {
    const [first] = await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    const [second] = await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    expect(second?.id).toBe(first?.id);
    expect(soundsNow()).toHaveLength(1);
  });

  it('are named by the file alone, and take the next name only where a record that moved on still holds it', async () => {
    const [first] = await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    expect(first?.id).toBe(recordIdFor('atlas-sound:music/a.mp3'));
    records.update([first!.id], { audioPath: 'atlas-sound:music/moved.mp3' });
    const [second] = await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    expect(second?.id).toBe(recordIdFor('atlas-sound:music/a.mp3', 1));
    expect(standingRecord(soundsNow().filter((sound) => sound.audioPath === 'atlas-sound:music/moved.mp3'))?.id).toBe(first?.id);
  });

  it('an edit makes the record where there is none, and keeps what was there', async () => {
    await editFiles(records, library, [fileOf('music', 'a.mp3')], { credit: 'Someone' });
    await editFiles(records, library, [fileOf('music', 'a.mp3')], { trimDb: -3 });
    expect(soundsNow()).toMatchObject([{ credit: 'Someone', trimDb: -3 }]);
  });
});

describe('moving and renaming', () => {
  it('carries records with a file, the mood that names one still finds it', async () => {
    write('Music', 'Battle/a.mp3');
    const [made] = await recordsForFiles(records, library, [fileOf('music', 'Battle/a.mp3')]);
    const moods = MoodStore.forApp(vault.app);
    const mood = moods.createMood({ name: 'Fight', fadeSeconds: 2, music: { tracks: [made!.id], shuffle: false, levelDb: 0 }, layers: [] });
    await moveEntries(context, [{ kind: 'music', path: 'Battle/a.mp3' }], 'ambience');
    expect(fs.existsSync(path.join(external('Ambience'), 'a.mp3'))).toBe(true);
    expect(soundsNow()).toMatchObject([{ id: made!.id, kind: 'ambience', audioPath: 'atlas-sound:ambience/a.mp3' }]);
    expect(moods.mood(mood.id)?.music).toMatchObject({ tracks: [made!.id] });
    await moods.flush();
    MoodStore.release(vault.app);
  });

  it('a rename carries the record, and the name that came from the file', async () => {
    write('Music', 'Old/a.mp3');
    await recordsForFiles(records, library, [fileOf('music', 'Old/a.mp3')]);
    await renameEntry(context, { kind: 'music', path: 'Old/a.mp3' }, 'z.mp3');
    expect(fs.existsSync(path.join(external('Music'), 'Old/z.mp3'))).toBe(true);
    expect(soundsNow()).toMatchObject([{ name: 'z', audioPath: 'atlas-sound:music/Old/z.mp3' }]);
  });

  it('numbers a name that is taken and never replaces a file', async () => {
    write('Music', 'a.mp3', 'ONE');
    write('Ambience', 'a.mp3', 'TWO');
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3' }], 'ambience');
    expect(fs.readFileSync(path.join(external('Ambience'), 'a.mp3'), 'utf8')).toBe('TWO');
    expect(fs.readFileSync(path.join(external('Ambience'), 'a 2.mp3'), 'utf8')).toBe('ONE');
    expect(fs.existsSync(path.join(external('Music'), 'a.mp3'))).toBe(false);
  });

  it('a file already in the other root stays where it is', async () => {
    write('Ambience', 'Deep/a.mp3');
    await moveEntries(context, [{ kind: 'ambience', path: 'Deep/a.mp3' }], 'ambience');
    expect(fs.existsSync(path.join(external('Ambience'), 'Deep/a.mp3'))).toBe(true);
  });

  it('a copy that fails leaves the source whole, and nothing half written', async () => {
    write('Music', 'a.mp3', 'AAA');
    const target = library.locationOf('ambience')!;
    vi.spyOn(target, 'write').mockRejectedValue(new Error('disk full'));
    await expect(moveEntries(context, [{ kind: 'music', path: 'a.mp3' }], 'ambience')).rejects.toThrow('disk full');
    expect(fs.readFileSync(path.join(external('Music'), 'a.mp3'), 'utf8')).toBe('AAA');
    expect(fs.existsSync(path.join(external('Ambience'), 'a.mp3'))).toBe(false);
  });

  it('moves a file from a disk into the vault, and back, and the record follows', async () => {
    await open({ music: external('Music') }, { music: { type: 'external' }, ambience: { type: 'vault', path: 'Audio' } });
    write('Music', 'Set/Deep/b.mp3', 'BBB');
    await recordsForFiles(records, library, [fileOf('music', 'Set/Deep/b.mp3')]);
    await moveEntries(context, [{ kind: 'music', path: 'Set/Deep/b.mp3' }], 'ambience');
    expect(vault.files.get('Audio/b.mp3')).toBe('BBB');
    expect(fs.existsSync(path.join(external('Music'), 'Set/Deep/b.mp3'))).toBe(false);
    expect(soundsNow().map((sound) => [sound.audioPath, sound.kind])).toEqual([['Audio/b.mp3', 'ambience']]);
    await moveEntries(context, [{ kind: 'ambience', path: 'b.mp3' }], 'music');
    expect(vault.files.has('Audio/b.mp3')).toBe(false);
    expect(fs.readFileSync(path.join(external('Music'), 'b.mp3'), 'utf8')).toBe('BBB');
    expect(soundsNow().map((sound) => [sound.audioPath, sound.kind])).toEqual([['atlas-sound:music/b.mp3', 'music']]);
  });

  it('within the vault goes through fileManager, between roots too', async () => {
    await open({}, { music: { type: 'vault', path: 'Music' }, ambience: { type: 'vault', path: 'Audio' } });
    await vault.app.vault.createFolder('Music');
    await vault.app.vault.adapter.write('Music/a.mp3', 'A');
    await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3' }], 'ambience');
    expect(vault.app.fileManager.renameFile).toHaveBeenCalledTimes(1);
    expect(vault.files.has('Audio/a.mp3')).toBe(true);
    expect(soundsNow()).toMatchObject([{ kind: 'ambience', audioPath: 'Audio/a.mp3' }]);
  });
});

describe('a file gone from its path', () => {
  it('is found by name and size in its root, and otherwise waits; the record stays as it is', async () => {
    write('Music', 'a.mp3', '12345');
    write('Music', 'b.mp3', '12345');
    await recordsForFiles(records, library, [fileOf('music', 'a.mp3'), fileOf('music', 'b.mp3'), fileOf('music', 'c.mp3')]);
    await records.flush();
    const before = soundsNow().map((sound) => ({ ...sound }));
    fs.mkdirSync(path.join(external('Music'), 'Moved'));
    fs.renameSync(path.join(external('Music'), 'a.mp3'), path.join(external('Music'), 'Moved/a.mp3'));
    fs.rmSync(path.join(external('Music'), 'b.mp3'));
    fs.writeFileSync(path.join(external('Music'), 'b-other-size.mp3'), 'XX');
    expect(library.statOfFile('atlas-sound:music/a.mp3', 5)).toBeNull();
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.pathNow('atlas-sound:music/a.mp3', 5)).toBe('atlas-sound:music/Moved/a.mp3'));
    expect(library.statOfFile('atlas-sound:music/a.mp3', 5)).toMatchObject({ size: 5 });
    expect(await (await library.readFile('atlas-sound:music/a.mp3', 5)).text()).toBe('12345');
    expect(library.pathNow('atlas-sound:music/a.mp3', 5)).toBe('atlas-sound:music/Moved/a.mp3');
    expect(library.statOfFile('atlas-sound:music/a.mp3')).toBeNull();
    expect(library.statOfFile('atlas-sound:music/b.mp3', 5)).toBeNull();
    expect(library.pathNow('atlas-sound:music/b.mp3', 5)).toBe('atlas-sound:music/b.mp3');
    expect(soundsNow()).toEqual(before);
  });

  it('on a device without the root waits, and nothing fails', async () => {
    await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    await open({}, { music: { type: 'external' } });
    expect(library.rootOf('music').status).toBe('not-linked-here');
    expect(library.filesOf('music')).toEqual([]);
    expect(library.statOfFile('atlas-sound:music/a.mp3', 5)).toBeNull();
    await expect(library.readFile('atlas-sound:music/a.mp3', 5)).rejects.toThrow('not reachable');
    expect(soundsNow()).toHaveLength(1);
  });

  it('in a vault root is found too, once the root was read', async () => {
    await open({}, { music: { type: 'vault', path: 'Audio' } });
    await vault.app.vault.adapter.write('Audio/Moved/a.mp3', '12345');
    expect(library.statOfFile('Audio/a.mp3', 5)).toBeNull();
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.pathNow('Audio/a.mp3', 5)).toBe('Audio/Moved/a.mp3'));
    expect(library.statOfFile('Audio/a.mp3', 5)).toMatchObject({ size: 5 });
    expect(library.pathNow('Audio/a.mp3', 5)).toBe('Audio/Moved/a.mp3');
    expect(await (await library.readFile('Audio/a.mp3', 5)).text()).toBe('12345');
  });
});

describe('a file in another folder than its record says', () => {
  const moved = async (): Promise<ReturnType<typeof fileOf>> => {
    write('Music', 'Tavern/a.mp3', '12345');
    await recordsForFiles(records, library, [fileOf('music', 'Tavern/a.mp3')]);
    fs.mkdirSync(path.join(external('Music'), 'Inns'));
    fs.renameSync(path.join(external('Music'), 'Tavern/a.mp3'), path.join(external('Music'), 'Inns/a.mp3'));
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.pathNow('atlas-sound:music/Tavern/a.mp3', 5)).toBe('atlas-sound:music/Inns/a.mp3'));
    return fileOf('music', 'Inns/a.mp3');
  };

  it('has the record it has: first use makes no second', async () => {
    const row = await moved();
    const before = soundsNow().map((sound) => ({ ...sound }));
    const [record] = await recordsForFiles(records, library, [row]);
    expect(soundsNow()).toEqual(before);
    expect(record?.id).toBe(before[0]?.id);
    expect(soundOfFile(recordsByFile(soundsNow(), library), row, 'atlas-sound:music/Inns/a.mp3').id).toBe(before[0]?.id);
  });

  it('takes an edit on its record, the one every device reads', async () => {
    const row = await moved();
    await editFiles(records, library, [row], { trimDb: -3 });
    expect(soundsNow()).toHaveLength(1);
    expect(soundsNow()[0]).toMatchObject({ trimDb: -3, audioPath: 'atlas-sound:music/Tavern/a.mp3' });
  });

  it('takes its record along when its row is deleted', async () => {
    const row = await moved();
    const entries = [{ kind: 'music' as const, path: row.path }];
    const { sounds } = await usesOf(context, { moods: () => [], whenLoaded: () => Promise.resolve() }, entries);
    expect(sounds.map((sound) => sound.id)).toEqual(soundsNow().map((sound) => sound.id));
    await trashEntries(context, entries, sounds);
    expect(soundsNow()).toEqual([]);
  });
});

describe('deleting', () => {
  it('names the moods that use it, and takes the records along', async () => {
    write('Music', 'Set/a.mp3');
    const [made] = await recordsForFiles(records, library, [fileOf('music', 'Set/a.mp3')]);
    const moods = MoodStore.forApp(vault.app);
    await moods.whenLoaded();
    moods.createMood({ name: 'Fight', fadeSeconds: 2, music: 'none', layers: [{ sound: made!.id, levelDb: 0 }] });
    const entries = [{ kind: 'music' as const, path: 'Set/a.mp3' }];
    const uses = await usesOf(context, moods, entries);
    expect(uses.moods).toBe(1);
    expect(uses.sounds.map((sound) => sound.id)).toEqual([made!.id]);
    await trashEntries(context, entries, uses.sounds);
    expect(fs.existsSync(path.join(external('Music'), 'Set/a.mp3'))).toBe(false);
    expect(soundsNow()).toEqual([]);
    await moods.flush();
    MoodStore.release(vault.app);
  });

  it('is refused without a trash, and everything stays', async () => {
    canTrash = false;
    await open({ music: external('Music') }, {});
    write('Music', 'a.mp3');
    await recordsForFiles(records, library, [fileOf('music', 'a.mp3')]);
    const entries = [{ kind: 'music' as const, path: 'a.mp3' }];
    await expect(trashEntries(context, entries, soundsNow())).rejects.toBeInstanceOf(TrashUnavailableError);
    expect(fs.existsSync(path.join(external('Music'), 'a.mp3'))).toBe(true);
    expect(soundsNow()).toHaveLength(1);
  });
});

describe('importing', () => {
  it('copies to the top of the root under a free name, and makes no record', async () => {
    write('Music', 'a.mp3', 'OLD');
    const outcome = await importIntoLibrary(library, [new File(['NEW'], 'a.mp3'), new File(['X'], 'cover.png')], 'music');
    expect(outcome).toEqual({ added: ['a 2.mp3'], refused: ['cover.png'], failed: [] });
    expect(fs.readFileSync(path.join(external('Music'), 'a.mp3'), 'utf8')).toBe('OLD');
    expect(fs.readFileSync(path.join(external('Music'), 'a 2.mp3'), 'utf8')).toBe('NEW');
    expect(soundsNow()).toEqual([]);
  });

  it('with nothing linked goes to the default vault folder, which is then linked', async () => {
    await open({}, {});
    const outcome = await importIntoLibrary(library, [new File(['NEW'], 'a.mp3')], 'ambience');
    expect(outcome.added).toEqual(['a.mp3']);
    expect(vault.files.get('atlas-vtt/sounds/ambience/a.mp3')).toBe('NEW');
    expect(library.rootOf('ambience')).toMatchObject({ status: 'vault', path: 'atlas-vtt/sounds/ambience' });
  });

  it('is refused for a root linked only on another device', async () => {
    await open({}, { music: { type: 'external' } });
    const outcome = await importIntoLibrary(library, [new File(['NEW'], 'a.mp3')], 'music');
    expect(outcome.failed).toEqual(['a.mp3']);
    expect(vault.files.has('atlas-vtt/sounds/music/a.mp3')).toBe(false);
  });
});

describe('the bytes of a file on disk', () => {
  it('reach whoever converts it through what its record says', async () => {
    write('Music', 'Battle/a.mp3', 'BYTES');
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.statOfFile('atlas-sound:music/Battle/a.mp3')).toMatchObject({ size: 5 }));
    const blob = await library.readFile('atlas-sound:music/Battle/a.mp3');
    expect(await blob.text()).toBe('BYTES');
    await expect(library.readFile('atlas-sound:music/../../secret.mp3')).rejects.toThrow('not reachable');
  });

  it('a change on disk reaches the files by the watch', async () => {
    write('Music', 'a.mp3');
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.filesOf('music')).toHaveLength(1));
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    write('Music', 'b.mp3');
    await vi.waitFor(() => expect(library.filesOf('music').map(({ entry }) => entry.name)).toEqual(['a.mp3', 'b.mp3']), { timeout: 5000 });
  });
});

describe('browsing', () => {
  it('reads in the background, counts and searches, and stays right after changes', async () => {
    write('Music', 'Battle/a.mp3');
    write('Music', 'Battle/Bosses/b.mp3');
    write('Music', 'Travel/Road song.mp3');
    write('Ambience', 'Rain.ogg');
    expect(library.filesOf('music')).toEqual([]);
    expect(library.isWalked('music')).toBe(false);
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.isWalked('music')).toBe(true));
    await vi.waitFor(() => expect(library.countOf('ambience', '')).toBe(1));
    expect(library.countOf('music', '')).toBe(3);
    expect(library.search('road').map((file) => file.path)).toEqual(['Travel/Road song.mp3']);
    expect(library.search('rain')).toMatchObject([{ kind: 'ambience', path: 'Rain.ogg' }]);
    write('Music', 'Battle/c.mp3');
    await library.settle('music', ['Battle/c.mp3']);
    expect(library.countOf('music', '')).toBe(4);
    fs.rmSync(path.join(external('Music'), 'Battle'), { recursive: true });
    await library.settle('music', ['Battle']);
    expect(library.countOf('music', '')).toBe(1);
    expect(library.search('bosses')).toEqual([]);
  });

  it('lists every file below a root flat by name, whatever folder it lies in, in reading order', async () => {
    for (const name of ['Battle/Track 10.mp3', 'Battle/Bosses/Track 2.mp3', 'Émile.mp3', 'Zed.mp3', 'Calm/alpha.mp3']) write('Music', name);
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.isWalked('music')).toBe(true));
    expect(library.filesOf('music').map(({ entry }) => entry.name)).toEqual(['alpha.mp3', 'Émile.mp3', 'Track 2.mp3', 'Track 10.mp3', 'Zed.mp3']);
  });

  it('keeps its list while nothing changed', async () => {
    write('Music', 'a.mp3');
    library.rescan(100_000);
    await vi.waitFor(() => expect(library.isWalked('music')).toBe(true));
    const first = library.filesOf('music');
    await library.settle('music', ['a.mp3']);
    expect(library.filesOf('music')).toBe(first);
  });

  it('searches 20,000 names inside a frame', async () => {
    const entries = Array.from({ length: 20_000 }, (_, index) => ({ name: `Track ${index}.mp3`, path: `Folder ${index % 200}/Track ${index}.mp3`, size: 5, mtime: 1 }));
    const location = new VaultLocation(vault.app, 'Audio');
    vi.spyOn(location, 'list').mockImplementation(async (folder) => (folder === '' ? { folders: [], files: entries } : null));
    const big = new SoundLibrary({ roots: library.roots, open: () => location, home: () => null, probeSeconds: async () => null });
    big.rescan(100_000);
    await vi.waitFor(() => expect(big.countOf('music', '')).toBe(20_000));
    await vi.waitFor(() => expect(big.countOf('ambience', '')).toBe(20_000));
    big.search('warm');
    const start = performance.now();
    const hits = big.search('track 19999');
    expect(performance.now() - start).toBeLessThan(16);
    expect(hits.map((hit) => hit.kind)).toEqual(['music', 'ambience']);
    big.destroy();
  });
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

it('a root above Atlas\' own folders never lists its moods and records, and neither can be a root', async () => {
  for (const folder of ['atlas-vtt/sounds/moods', 'atlas-vtt/sounds/records', 'atlas-vtt/sounds/music']) await vault.app.vault.createFolder(folder);
  await vault.app.vault.adapter.write('atlas-vtt/sounds/records/a.mp3', 'A');
  const listing = await new VaultLocation(vault.app, 'atlas-vtt/sounds').list('');
  expect(listing?.folders.map((folder) => folder.name)).toEqual(['music']);
  expect(listing?.files).toEqual([]);
  let shared: SharedSoundRoots = {};
  const roots = new SoundRoots({ shared: () => shared, setShared: (next) => { shared = next; }, onSharedChange: () => () => undefined, local: () => null, setLocal: () => undefined, vaultBase: () => '/vault', realPath: async (value) => value });
  expect(roots.linkVault('music', 'atlas-vtt/sounds/moods')).toBe('reserved');
  expect(roots.linkVault('music', 'atlas-vtt/sounds/records/deep')).toBe('reserved');
  expect(await roots.linkChosen('music', '/vault/atlas-vtt/sounds/records')).toBe('reserved');
  expect(roots.stateOf('music').status).toBe('unlinked');
  expect(roots.linkVault('music', 'atlas-vtt/sounds/music')).toBe('linked');
});
