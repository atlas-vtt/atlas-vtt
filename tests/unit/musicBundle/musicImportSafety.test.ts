import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installedMusic } from '../../../src/app/services/musicBundle/installedMusic';
import { readMusicBundle } from '../../../src/app/services/musicBundle/musicBundleReader';
import { openMusicImport } from '../../../src/app/services/musicBundle/musicImport';
import type { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import type { SoundListing } from '../../../src/app/soundLibrary/soundLocation';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { deliveredMusic } from '../../helpers/musicBundles';
import { deliveredAlbum as album, MUSIC_UID as UID, musicLibraryOn, NO_RECORDS, openInstall } from '../../helpers/musicImportRig';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

let location: FakeSoundLocation;
let library: SoundLibrary;

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  location = new FakeSoundLocation();
  library = musicLibraryOn(location);
});

afterEach(() => {
  library.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const single = (version: number, name = 'Dawn', artist?: string, uid = UID, sound = '1'): Promise<Blob> =>
  deliveredMusic({ kind: 'music-track', uid, version, name, artist, titles: [name], sounds: [sound] });

/** Every file with a hash of its bytes, and every folder: what "as it was" means. */
async function stateOf(fake: FakeSoundLocation): Promise<string[]> {
  const files = await Promise.all([...fake.files.keys()].map(async (path) => `${path} ${await sha256(await fake.contents.get(path)!.arrayBuffer())}`));
  return [...files.sort(), ...[...fake.folders].sort().map((folder) => `folder ${folder}`)];
}

/** Lets exactly one change fail, the first time it is asked for: taking it back must still work. */
function failOnce(fake: FakeSoundLocation, change: string): void {
  let failed = false;
  fake.failing = (asked) => {
    if (failed || asked !== change) return null;
    failed = true;
    return new Error('the disk said no');
  };
}

describe('an update of music that fails', () => {
  it('leaves the folder exactly as it was at every stage, and trashes nothing', async () => {
    await (await openInstall(library, await album(1, ['Dawn', 'Dusk', 'Night']))).apply();
    const before = await stateOf(location);
    const night = await location.contents.get('Mara/Old Roads/03 Night.opus')!.arrayBuffer();
    // Dawn is new audio, Night moves up a place, Dusk goes and Day comes.
    const update = await album(2, ['Dawn', 'Night', 'Day'], 'Mara', ['5', '3', '4']);
    const stages = [
      'write Mara/Old Roads/03 Day.opus.atlas-part',
      'move Mara/Old Roads/02 Dusk.opus Mara/Old Roads/02 Dusk.opus.atlas-old',
      'move Mara/Old Roads/03 Night.opus Mara/Old Roads/03 Night.opus.atlas-old',
      'move Mara/Old Roads/01 Dawn.opus.atlas-part Mara/Old Roads/01 Dawn.opus',
      'move Mara/Old Roads/03 Night.opus.atlas-old Mara/Old Roads/02 Night.opus',
      'replace Mara/Old Roads/Armarium.json',
    ];
    for (const stage of stages) {
      await library.reread('music');
      const session = await openInstall(library, update);
      const trashedBefore = location.changes.filter((change) => change.startsWith('trash')).length;
      failOnce(location, stage);
      await expect(session.apply(), stage).rejects.toThrow(/could not be installed: the disk said no/);
      expect(await stateOf(location), stage).toEqual(before);
      expect(location.changes.filter((change) => change.startsWith('trash')).length, stage).toBe(trashedBefore);
    }
    location.failing = () => null;
    await library.reread('music');
    expect(await (await openInstall(library, update)).apply()).toMatchObject({ outcome: 'update', version: 2 });
    expect([...location.files.keys()].sort()).toEqual(['Mara/Old Roads/01 Dawn.opus', 'Mara/Old Roads/02 Night.opus', 'Mara/Old Roads/03 Day.opus', 'Mara/Old Roads/Armarium.json']);
    expect(await sha256(await location.contents.get('Mara/Old Roads/02 Night.opus')!.arrayBuffer())).toBe(await sha256(night));
  });
});

describe('a music folder without a trash', () => {
  it('takes a new install, removing a part an earlier try left without the trash', async () => {
    location.trashable = false;
    location.put('Dawn.opus.atlas-part', new Blob(['half of an earlier try']));
    await (await openInstall(library, await single(1))).apply();
    expect([...location.files.keys()].sort()).toEqual(['Dawn.armarium.json', 'Dawn.opus']);
    expect(location.changes).toContain('remove Dawn.opus.atlas-part');
  });

  it('takes back a failed install without the trash', async () => {
    location.trashable = false;
    location.failing = (change) => (change.startsWith('move Mara/Old Roads/02') ? new Error('busy') : null);
    await expect((await openInstall(library, await album(1, ['Dawn', 'Dusk']))).apply()).rejects.toThrow(/busy/);
    expect(await stateOf(location)).toEqual(['folder ']);
  });

  it('refuses an update that would replace or remove files, before anything is written', async () => {
    await (await openInstall(library, await single(1))).apply();
    await library.reread('music');
    location.trashable = false;
    const changes = location.changes.length;
    await expect(openInstall(library, await single(2, 'Dawn', undefined, UID, '2'))).rejects.toThrow(/no trash/);
    expect(location.changes.length).toBe(changes);
  });

  it('is what a vault that deletes files for good has', async () => {
    const { app, files } = createInMemoryApp({ folders: ['Music'] });
    Object.assign(app.vault, { getConfig: (key: string) => (key === 'trashOption' ? 'none' : undefined) });
    const vault = musicLibraryOn(new VaultLocation(app, 'Music'), { music: { type: 'vault', path: 'Music' } }, null);
    try {
      await (await openInstall(vault, await single(1))).apply();
      expect([...files.keys()].filter((path) => path.startsWith('Music/')).sort()).toEqual(['Music/Dawn.armarium.json', 'Music/Dawn.opus']);
      await vault.reread('music');
      await vault.settle('music', ['Dawn.opus']);
      await expect(openInstall(vault, await single(2, 'Dawn', undefined, UID, '2'))).rejects.toThrow(/no trash/);
      expect(app.fileManager.trashFile).not.toHaveBeenCalled();
      expect(files.has('Music/Dawn.opus')).toBe(true);
    } finally {
      vault.destroy();
    }
  });
});

describe('where music cannot be installed yet', () => {
  it('refuses a music folder linked on another device only, before the review', async () => {
    const elsewhere = musicLibraryOn(location, { music: { type: 'external' } }, null);
    try {
      await expect(openInstall(elsewhere, await single(1))).rejects.toThrow(/not linked on this device/);
    } finally {
      elsewhere.destroy();
    }
  });

  it('refuses while the music folder is still being read, rather than taking an update for a new install', async () => {
    class SlowLocation extends FakeSoundLocation {
      override list(): Promise<SoundListing | null> {
        return new Promise(() => undefined);
      }
    }
    const slow = musicLibraryOn(new SlowLocation());
    const bundle = await readMusicBundle(await single(2));
    vi.useFakeTimers();
    try {
      const opening = openMusicImport({ library: slow, records: NO_RECORDS }, bundle, { listingUid: UID });
      const refused = expect(opening).rejects.toThrow(/still reading your music folder/);
      await vi.advanceTimersByTimeAsync(16_000);
      await refused;
    } finally {
      slow.destroy();
    }
  });
});

describe('where music lands', () => {
  it('never puts a single in an album\'s folder, whose sidecar would hide it', async () => {
    await (await openInstall(library, await deliveredMusic({ kind: 'music-album', uid: UID, version: 1, name: 'Lanterns', titles: ['Dawn', 'Dusk'] }))).apply();
    await library.reread('music');
    const other = 'fedcba9876543210fedcba9876543210';
    const session = await openInstall(library, await single(1, 'Glow', 'Lanterns', other), other);
    expect(session.review.where).toEqual(['Music', 'Lanterns 2']);
    await session.apply();
    await library.reread('music');
    await library.settle('music', ['Lanterns 2/Glow.opus']);
    expect((await installedMusic(library))?.map(({ sidecar }) => sidecar.uid).sort()).toEqual([UID, other].sort());
  });

  it('installs one at a time, so a second install planned at the same time sees the first', async () => {
    const data = await album(1, ['Dawn', 'Dusk']);
    const first = await openInstall(library, data, null);
    const second = await openInstall(library, data, null);
    const [one, two] = await Promise.allSettled([first.apply(), second.apply()]);
    expect(one.status).toBe('fulfilled');
    expect(two).toMatchObject({ status: 'rejected', reason: { message: expect.stringMatching(/changed since the review/) } });
    expect([...location.files.keys()].sort()).toEqual(['Mara/Old Roads/01 Dawn.opus', 'Mara/Old Roads/02 Dusk.opus']);
  });
});
