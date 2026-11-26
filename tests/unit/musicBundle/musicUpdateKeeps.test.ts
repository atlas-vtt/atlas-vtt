import { TFile } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicRecords } from '../../../src/app/services/musicBundle/musicInstallRecords';
import { readSidecar } from '../../../src/app/services/musicBundle/musicProvenance';
import { describeMusicImport } from '../../../src/app/packages/components/asset-manager/hooks/importResultText';
import type { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { RECORDS_FOLDER } from '../../../src/app/soundLibrary/soundFiles';
import { TrashNotTakenError } from '../../../src/app/soundLibrary/soundLocation';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';
import { SoundRecordStore } from '../../../src/app/soundLibrary/SoundRecordStore';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { deliveredAlbum as album, musicLibraryOn, openInstall } from '../../helpers/musicImportRig';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const NIGHT = ['Dancing with the Wisps', 'Tales of the Moonfolk', 'Faerie Fire Waltz', 'Tricksy Sprites', 'Tending the Flames', 'Night of the Wilds'];
const SIX = ['1', '2', '3', '4', '5', '6'];

/** Records held in memory, written as the store writes them. */
function memoryRecords(sounds: StoredSound[]): MusicRecords & { list: StoredSound[] } {
  const records = {
    list: sounds,
    whenLoaded: () => Promise.resolve(),
    all: () => records.list,
    rewrite: (change: (stored: StoredSound) => StoredSound | null) => {
      records.list = records.list.map((stored) => change(stored) ?? stored);
      return true;
    },
    remove: (id: string) => {
      records.list = records.list.filter((stored) => stored.id !== id);
    },
  };
  return records;
}

const sound = (id: string, audioPath: string): StoredSound => ({ id, name: id, audioPath, kind: 'music', tags: [], createdAt: 1, modifiedAt: 1 });

/** A disk folder whose trash answers and takes nothing, as Obsidian's can without a system trash. */
class SilentTrash extends FakeSoundLocation {
  override async trash(path: string): Promise<void> {
    throw new TrashNotTakenError(path);
  }
}

let location: FakeSoundLocation;
let library: SoundLibrary;

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  location = new FakeSoundLocation();
  library = musicLibraryOn(location);
});

afterEach(() => {
  library.destroy();
  vi.unstubAllGlobals();
});

const hashOf = async (path: string): Promise<string> => sha256(await location.contents.get(path)!.arrayBuffer());
const folder = 'Mara/Old Roads';

describe('an update of music whose tracks are the same audio', () => {
  it('leaves an unchanged track alone, renames one whose title changed, and says how many stay as they are', async () => {
    await (await openInstall(library, await album(1, NIGHT, 'Mara', SIX))).apply();
    await library.reread('music');
    const before = await Promise.all(NIGHT.map((title, index) => hashOf(`${folder}/0${index + 1} ${title}.opus`)));
    const changes = location.changes.length;
    const renamed = NIGHT.map((title) => (title === 'Tricksy Sprites' ? 'Tricksy Little Sprites' : title));
    const session = await openInstall(library, await album(2, renamed, 'Mara', SIX));
    expect(session.review.update).toEqual({ from: 1, replaced: 0, renamed: 1, unchanged: 5, added: 0, removed: 0, kept: 0 });

    await session.apply();
    expect(location.changes.slice(changes)).toEqual([
      `move ${folder}/04 Tricksy Sprites.opus ${folder}/04 Tricksy Sprites.opus.atlas-old`,
      `move ${folder}/04 Tricksy Sprites.opus.atlas-old ${folder}/04 Tricksy Little Sprites.opus`,
      `replace ${folder}/Armarium.json`,
    ]);
    const after = await Promise.all(renamed.map((title, index) => hashOf(`${folder}/0${index + 1} ${title}.opus`)));
    expect(after).toEqual(before);
    const sidecar = readSidecar(await location.contents.get(`${folder}/Armarium.json`)!.text());
    expect(sidecar?.version).toBe(2);
    expect(sidecar?.tracks.map((track) => track.sha256)).toEqual(before);
    expect(sidecar?.tracks[3]?.file).toBe('04 Tricksy Little Sprites.opus');
  });

  it('renames a track that only moved, and its record follows; a track taken out goes with its record', async () => {
    await (await openInstall(library, await album(1, ['Intro', 'Song', 'Outro'], 'Mara', ['1', '2', '3']))).apply();
    await library.reread('music');
    const records = memoryRecords([sound('song', `atlas-sound:music/${folder}/02 Song.opus`), sound('intro', `atlas-sound:music/${folder}/01 Intro.opus`), sound('other', 'atlas-sound:music/Else/x.mp3')]);
    const session = await openInstall(library, await album(2, ['Song', 'Outro'], 'Mara', ['2', '3']), undefined, records);
    expect(session.review.update).toEqual({ from: 1, replaced: 0, renamed: 2, unchanged: 0, added: 0, removed: 1, kept: 0 });
    await session.apply();
    expect([...location.files.keys()].sort()).toEqual([`${folder}/01 Song.opus`, `${folder}/02 Outro.opus`, `${folder}/Armarium.json`]);
    expect(records.list.map(({ id, audioPath }) => [id, audioPath])).toEqual([['song', `atlas-sound:music/${folder}/01 Song.opus`], ['other', 'atlas-sound:music/Else/x.mp3']]);
  });

  it('writes a track anew where its old name is another track\'s new one, so no copy names a file beside it that is not its source', async () => {
    await (await openInstall(library, await album(1, ['Dawn', 'Dusk'], 'Mara', ['1', '2']))).apply();
    await library.reread('music');
    // Dusk's audio moves to the first place, and new audio takes the name "02 Dusk".
    const session = await openInstall(library, await album(2, ['Dusk', 'Dusk'], 'Mara', ['2', '3']));
    expect(session.review.update).toMatchObject({ renamed: 0, replaced: 1 });
  });
});

describe('the records of an updated album in the vault', () => {
  it('keep naming each replaced track in its place, and a failed update leaves every record as it was', async () => {
    const vault = createInMemoryApp({ folders: ['Music', RECORDS_FOLDER] });
    Object.assign(vault.app.vault, { getConfig: (key: string) => (key === 'trashOption' ? 'system' : undefined) });
    // Obsidian tells a rename to whoever listens, the record store among them.
    vi.mocked(vault.app.fileManager.renameFile).mockImplementation(async (file, to) => {
      const from = file.path;
      await vault.app.vault.adapter.rename(from, to);
      vault.emit('rename', new TFile(to), from);
    });
    const records = SoundRecordStore.forApp(vault.app);
    await records.whenLoaded();
    const music = musicLibraryOn(new VaultLocation(vault.app, 'Music'), { music: { type: 'vault', path: 'Music' } }, null);
    try {
      await (await openInstall(music, await album(1, ['Dawn', 'Dusk', 'Night']), undefined, records)).apply();
      records.add([sound('dawn', `Music/${folder}/01 Dawn.opus`), sound('night', `Music/${folder}/03 Night.opus`)]);
      await music.reread('music');
      await music.settle('music', [`${folder}/01 Dawn.opus`]);
      const recorded = (): string[] => records.all().map(({ id, audioPath }) => `${id} ${audioPath}`).sort();
      const before = recorded();

      const update = await album(2, ['Dawn', 'Dusk', 'Night'], 'Mara', ['4', '5', '3']);
      const failing = vi.mocked(vault.app.fileManager.renameFile).getMockImplementation()!;
      vi.mocked(vault.app.fileManager.renameFile).mockImplementationOnce(failing).mockImplementationOnce(failing).mockImplementationOnce(async () => { throw new Error('busy'); });
      await expect((await openInstall(music, update, undefined, records)).apply()).rejects.toThrow(/busy/);
      expect(recorded()).toEqual(before);

      await music.reread('music');
      await (await openInstall(music, update, undefined, records)).apply();
      expect(recorded()).toEqual(before);
      expect(records.all().some(({ audioPath }) => audioPath.endsWith('.atlas-old') || audioPath.endsWith('.atlas-part'))).toBe(false);
    } finally {
      music.destroy();
      SoundRecordStore.release(vault.app);
    }
  });
});

describe('an update whose old files the trash does not take', () => {
  it('puts them back in the folder under free names, says so, and a later update does not trip over them', async () => {
    const silent = new SilentTrash();
    const music = musicLibraryOn(silent);
    try {
      await (await openInstall(music, await album(1, ['Dawn', 'Dusk', 'Night'], 'Mara', ['1', '2', '3']))).apply();
      await music.reread('music');
      const records = memoryRecords([sound('night', `atlas-sound:music/${folder}/03 Night.opus`)]);
      const result = await (await openInstall(music, await album(2, ['Dawn', 'Dusk'], 'Mara', ['4', '2']), undefined, records)).apply();
      expect([...silent.files.keys()].sort()).toEqual([`${folder}/01 Dawn 2.opus`, `${folder}/01 Dawn.opus`, `${folder}/02 Dusk.opus`, `${folder}/03 Night.opus`, `${folder}/Armarium.json`]);
      expect(result.putBack).toEqual(['01 Dawn 2.opus', '03 Night.opus']);
      expect(describeMusicImport(result)).toBe('Old Roads is updated to v2. The trash did not take the old files 01 Dawn 2.opus and 03 Night.opus, so they are back in the music folder for you to delete.');
      // The track taken out is still the GM's file, so its record stays with it.
      expect(records.list[0]?.audioPath).toBe(`atlas-sound:music/${folder}/03 Night.opus`);

      await music.reread('music');
      await (await openInstall(music, await album(3, ['Dawn', 'Dusk'], 'Mara', ['5', '2']))).apply();
      expect([...silent.files.keys()].some((path) => path.endsWith('.atlas-old'))).toBe(false);
    } finally {
      music.destroy();
    }
  });

  it('lets go of an aside an earlier install left of a track that now stays as it is', async () => {
    await (await openInstall(library, await album(1, ['Dawn', 'Dusk'], 'Mara', ['1', '2']))).apply();
    location.put(`${folder}/02 Dusk.opus.atlas-old`, new Blob(['left by a trash that took nothing']));
    await library.reread('music');
    await (await openInstall(library, await album(2, ['Dawn', 'Dusk'], 'Mara', ['3', '2']))).apply();
    expect(location.changes).toContain(`trash ${folder}/02 Dusk.opus.atlas-old`);
    expect([...location.files.keys()].some((path) => path.endsWith('.atlas-old'))).toBe(false);
  });
});
