import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { recordIdFor, recordsForFiles } from '../../../src/app/soundLibrary/libraryRecords';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import { MOODS_FOLDER, RECORDS_FOLDER } from '../../../src/app/soundLibrary/soundFiles';
import { externalAudioPath } from '../../../src/app/soundLibrary/soundPaths';
import { SoundRecordStore } from '../../../src/app/soundLibrary/SoundRecordStore';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';
import { FakeSync, seededRandom } from '../library/fakeSync';

/**
 * Two devices use one set of moods and sound records while a file sync carries their files between
 * them, sometimes after long offline stretches; edits made on both sides at once lose one side as sync
 * tools do. Whatever happens, once the sync has settled both devices must hold the same, each must hold
 * what its files say, and no record nobody deleted may be lost.
 */

const TRIALS = Number(import.meta.env.VITE_LIBRARY_SYNC_TRIALS ?? 12);
const STEPS = 30;
const WATCHED = [MOODS_FOLDER, RECORDS_FOLDER, 'Library'];

/** What a device's library says of a file below a root outside the vault: its absolute path is in no record. */
const EXTERNAL_LIBRARY = { audioPathOf: externalAudioPath };
/** A root that is the vault's folder `Library`. */
const VAULT_LIBRARY = { audioPathOf: (_kind: string, path: string): string => `Library/${path}` };

interface Device {
  vault: InMemoryApp;
  moods: MoodStore;
  records: SoundRecordStore;
}

const devicesMade: Device[] = [];

function device(): Device {
  const vault = createInMemoryApp({ folders: WATCHED });
  const made = { vault, moods: MoodStore.forApp(vault.app), records: SoundRecordStore.forApp(vault.app) };
  devicesMade.push(made);
  return made;
}

function fileOf(path: string): TFile {
  const file = new TFile(path);
  file.stat = { ctime: 0, mtime: 0, size: 0 };
  return file;
}

const watched = (path: string): boolean => WATCHED.some((folder) => path.startsWith(`${folder}/`));

/** One exchange, told to each device as the vault's events would tell it. */
async function deliver(sync: FakeSync, devices: readonly Device[]): Promise<void> {
  const before = devices.map(({ vault }) => new Map(vault.files));
  await sync.exchange();
  devices.forEach(({ vault }, index) => {
    for (const [path, content] of vault.files) {
      if (!watched(path) || before[index]!.get(path) === content) continue;
      vault.emit(before[index]!.has(path) ? 'modify' : 'create', fileOf(path));
    }
    for (const path of before[index]!.keys()) {
      if (watched(path) && !vault.files.has(path)) vault.emit('delete', fileOf(path));
    }
  });
}

/** Lets the events' reads finish, and every write. */
async function rest(devices: readonly Device[]): Promise<void> {
  for (const { moods, records } of devices) {
    await moods.flush();
    await records.flush();
  }
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

async function settle(sync: FakeSync, devices: readonly Device[]): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await deliver(sync, devices);
    await rest(devices);
  }
}

async function start(seed: number): Promise<{ devices: readonly [Device, Device]; sync: FakeSync; random: () => number }> {
  const random = seededRandom(seed);
  const devices = [device(), device()] as const;
  for (const { moods, records } of devices) await Promise.all([moods.whenLoaded(), records.whenLoaded()]);
  return { devices, sync: new FakeSync(devices[0].vault, devices[1].vault, random), random };
}

const moodsOn = ({ moods }: Device): unknown[] => moods.moods().map(({ id, name, order, layers }) => ({ id, name, order, layers }));
const recordsOn = ({ records }: Device): unknown[] => records.all().map(({ id, name, audioPath, kind, trimDb }) => ({ id, name, audioPath, kind, trimDb }));

afterEach(() => {
  for (const { vault } of devicesMade.splice(0)) {
    MoodStore.release(vault.app);
    SoundRecordStore.release(vault.app);
  }
});

describe('moods on two devices', () => {
  it.each(Array.from({ length: TRIALS }, (_, index) => index + 1))('converge, whoever edits what (seed %i)', async (seed) => {
    const { devices, sync, random } = await start(seed);
    const pickFrom = <T>(items: readonly T[]): T | undefined => items[Math.floor(random() * items.length)];
    const made = new Set<string>();
    const removed = new Set<string>();

    for (let step = 0; step < STEPS; step++) {
      for (const one of devices) {
        const mood = pickFrom(one.moods.moods());
        const roll = random();
        if (roll < 0.35 || !mood) made.add(one.moods.createMood({ name: `Mood ${step}`, fadeSeconds: 4, music: 'keep', layers: [] }).id);
        else if (roll < 0.75) one.moods.saveMood({ ...mood, name: `Edit ${step}`, layers: [{ sound: `s${step}`, levelDb: -1 }] });
        else if (roll < 0.9) {
          removed.add(mood.id);
          one.moods.removeMood(mood.id);
        }
      }
      await rest(devices);
      if (random() < 0.5) {
        await deliver(sync, devices);
        await rest(devices);
      }
    }
    await settle(sync, devices);

    expect(moodsOn(devices[1]), `seed ${seed}: both devices hold the same moods`).toEqual(moodsOn(devices[0]));
    const fresh = MoodStore.forApp(createInMemoryApp({ files: Object.fromEntries(devices[0].vault.files), folders: WATCHED }).app);
    await fresh.whenLoaded();
    expect(fresh.moods().map(({ id, name }) => ({ id, name })), `seed ${seed}: they hold what the files say`)
      .toEqual(devices[0].moods.moods().map(({ id, name }) => ({ id, name })));
    const kept = devices[0].moods.moods().map((mood) => mood.id);
    for (const id of made) if (!removed.has(id)) expect(kept, `seed ${seed}: ${id} was never deleted`).toContain(id);
  });

  it('two devices saving a mood of one name keep both', async () => {
    const { devices, sync } = await start(3);
    const made = devices.map(({ moods }) => moods.createMood({ name: 'Tavern', fadeSeconds: 4, music: 'keep', layers: [] }));
    await rest(devices);
    await settle(sync, devices);
    for (const one of devices) expect(one.moods.moods().map((mood) => mood.id).sort()).toEqual(made.map((mood) => mood.id).sort());
  });
});

/** What a GM does with sounds: uses files from a disk and from the vault, renames them, edits and deletes records. */
async function editSounds(one: Device, random: () => number, n: string, created: Set<string>, deleted: Set<string>): Promise<void> {
  const { records, vault } = one;
  const sounds = records.all();
  const sound = sounds[Math.floor(random() * sounds.length)];
  const roll = random();
  if (roll < 0.2) {
    const name = `Shared ${Math.floor(random() * 4)}.mp3`;
    const [made] = await recordsForFiles(records, EXTERNAL_LIBRARY, [{ kind: 'music', name, path: `Battle/${name}`, size: 5, mtime: 1 }]);
    if (made) created.add(made.id);
  } else if (roll < 0.4 || !sound) {
    await vault.app.vault.adapter.write(`Library/${n}.mp3`, `AUDIO ${n}`);
    const [made] = await recordsForFiles(records, VAULT_LIBRARY, [{ kind: 'music', name: `${n}.mp3`, path: `${n}.mp3`, size: 5, mtime: 1 }]);
    if (made) created.add(made.id);
  } else if (roll < 0.65) {
    records.update([sound.id], { kind: 'ambience', trimDb: Math.floor(random() * 10) - 5, name: `Sound ${n}` });
  } else if (roll < 0.85) {
    if (vault.files.has(sound.audioPath)) {
      const to = `Library/${n}.mp3`;
      await vault.app.fileManager.renameFile(vault.app.vault.getFileByPath(sound.audioPath)!, to);
      vault.emit('rename', fileOf(to), sound.audioPath);
    }
  } else {
    deleted.add(sound.id);
    records.remove(sound.id);
  }
}

describe('sound records on two devices', () => {
  it.each(Array.from({ length: TRIALS }, (_, index) => index + 1))('converge without losing a record nobody deleted (seed %i)', async (seed) => {
    const { devices, sync, random } = await start(seed);
    const created = new Set<string>();
    const deleted = new Set<string>();
    let serial = 0;
    for (let step = 0; step < STEPS; step++) {
      for (const one of devices) {
        const edits = Math.floor(random() * 3);
        for (let i = 0; i < edits; i++) await editSounds(one, random, `n${seed}-${serial++}`, created, deleted);
      }
      await rest(devices);
      if (random() < 0.5) {
        await deliver(sync, devices);
        await rest(devices);
      }
    }
    await settle(sync, devices);

    expect(recordsOn(devices[1]), `seed ${seed}: both devices hold the same records`).toEqual(recordsOn(devices[0]));
    const freshVault = createInMemoryApp({ files: Object.fromEntries(devices[0].vault.files), folders: WATCHED });
    const fresh = SoundRecordStore.forApp(freshVault.app);
    await fresh.whenLoaded();
    expect(fresh.all().map(({ id, audioPath }) => ({ id, audioPath })), `seed ${seed}: they hold what the files say`)
      .toEqual(devices[0].records.all().map(({ id, audioPath }) => ({ id, audioPath })));
    SoundRecordStore.release(freshVault.app);
    const kept = devices[0].records.all().map((sound) => sound.id);
    for (const id of created) if (!deleted.has(id)) expect(kept, `seed ${seed}: ${id} was never deleted`).toContain(id);
  });

  it('a file used on both devices at once is one record, wherever each keeps the folder', async () => {
    const { devices, sync } = await start(3);
    const file = { kind: 'ambience' as const, name: 'Rain.ogg', path: 'Weather/Rain.ogg', size: 7, mtime: 1 };
    const [onA] = await recordsForFiles(devices[0].records, EXTERNAL_LIBRARY, [file], 1000);
    const [onB] = await recordsForFiles(devices[1].records, EXTERNAL_LIBRARY, [file], 2000);
    expect(onB?.id).toBe(onA?.id);
    expect(onA?.id).toBe(recordIdFor('atlas-sound:ambience/Weather/Rain.ogg'));
    await rest(devices);
    await settle(sync, devices);
    expect(devices[0].records.all().map((record) => record.audioPath)).toEqual(['atlas-sound:ambience/Weather/Rain.ogg']);
    expect(recordsOn(devices[1])).toEqual(recordsOn(devices[0]));
  });

  it('a record that arrives before its long track stays, waits, and finds the track', async () => {
    const { devices, sync } = await start(1);
    await devices[0].vault.app.vault.adapter.write('Library/long.mp3', 'AUDIO');
    const [made] = await recordsForFiles(devices[0].records, VAULT_LIBRARY, [{ kind: 'music', name: 'long.mp3', path: 'long.mp3', size: 5, mtime: 1 }]);
    await rest(devices);
    const path = `${RECORDS_FOLDER}/${made!.id}.json`;
    // The record's small file is carried first; the track is still on its way.
    await devices[1].vault.app.vault.adapter.write(path, devices[0].vault.files.get(path)!);
    devices[1].vault.emit('create', fileOf(path));
    await rest(devices);
    expect(devices[1].records.all()).toMatchObject([{ id: made!.id, audioPath: 'Library/long.mp3' }]);
    expect(devices[1].vault.files.has('Library/long.mp3')).toBe(false);
    await settle(sync, devices);
    expect(devices[1].vault.files.get('Library/long.mp3')).toBe('AUDIO');
    expect(recordsOn(devices[1])).toEqual(recordsOn(devices[0]));
  });

  it('a rename on one device reaches the other, and nothing else of the record is lost', async () => {
    const { devices, sync } = await start(2);
    await devices[0].vault.app.vault.adapter.write('Library/rain.mp3', 'AUDIO');
    const [made] = await recordsForFiles(devices[0].records, VAULT_LIBRARY, [{ kind: 'music', name: 'rain.mp3', path: 'rain.mp3', size: 5, mtime: 1 }]);
    devices[0].records.update([made!.id], { credit: 'Someone' });
    await rest(devices);
    await settle(sync, devices);
    await devices[0].vault.app.fileManager.renameFile(devices[0].vault.app.vault.getFileByPath('Library/rain.mp3')!, 'Library/storm.mp3');
    devices[0].vault.emit('rename', fileOf('Library/storm.mp3'), 'Library/rain.mp3');
    await rest(devices);
    await settle(sync, devices);
    expect(devices[1].records.all()).toMatchObject([{ id: made!.id, audioPath: 'Library/storm.mp3', name: 'storm', credit: 'Someone' }]);
    expect(devices[1].vault.files.get('Library/storm.mp3')).toBe('AUDIO');
  });

  it('browsing writes nothing', async () => {
    const { devices } = await start(4);
    await rest(devices);
    expect([...devices[0].vault.files.keys()].filter((path) => path.startsWith(RECORDS_FOLDER))).toEqual([]);
  });
});
