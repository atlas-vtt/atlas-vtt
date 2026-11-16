import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { recordIdFor } from '../../../src/app/soundLibrary/libraryRecords';
import { RECORDS_FOLDER } from '../../../src/app/soundLibrary/soundFiles';
import { SOUND_RECORD_FORMAT } from '../../../src/app/soundLibrary/soundRecords';
import { SoundRecordStore } from '../../../src/app/soundLibrary/SoundRecordStore';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const pathOf = (id: string): string => `${RECORDS_FOLDER}/${id}.json`;

const record = (id: string, audioPath: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, name: 'Rain', tags: [], createdAt: 1, modifiedAt: 1, audioPath, kind: 'ambience', ...extra,
});

const file = (id: string, audioPath = 'Audio/Rain.mp3', extra: Record<string, unknown> = {}): string => JSON.stringify({ format: 1, ...record(id, audioPath, extra) });

const vaults: InMemoryApp[] = [];

async function open(files: Record<string, string> = {}): Promise<{ vault: InMemoryApp; store: SoundRecordStore }> {
  const vault = createInMemoryApp({ files, folders: [RECORDS_FOLDER] });
  vaults.push(vault);
  const store = SoundRecordStore.forApp(vault.app);
  await store.whenLoaded();
  return { vault, store };
}

const stored = (vault: InMemoryApp, id: string): Record<string, unknown> => JSON.parse(vault.files.get(pathOf(id))!) as Record<string, unknown>;

function fileAt(path: string): TFile {
  const target = new TFile(path);
  target.stat = { ctime: 0, mtime: 0, size: 0 };
  return target;
}

afterEach(() => {
  for (const vault of vaults.splice(0)) SoundRecordStore.release(vault.app);
});

describe('SoundRecordStore', () => {
  it('reads the records, the same array while nothing changed, and leaves what holds none alone', async () => {
    const broken = '{ not json';
    const { vault, store } = await open({
      [pathOf('a')]: file('a'),
      [pathOf('bad')]: broken,
      [pathOf('nopath')]: JSON.stringify({ id: 'nopath', name: 'x' }),
      [`${RECORDS_FOLDER}/deep/b.json`]: file('b'),
      [`${RECORDS_FOLDER}/c.mp3`]: file('c'),
    });
    expect(store.all().map((sound) => sound.id)).toEqual(['a']);
    expect(store.all()).toBe(store.all());
    store.update(['a'], { trimDb: 1 });
    await store.flush();
    expect(vault.files.get(pathOf('bad'))).toBe(broken);
  });

  it('writes a new record at the path its id names, with its format', async () => {
    const { vault, store } = await open();
    store.add([record('sound-x', 'Audio/Rain.mp3') as never]);
    expect(store.all()).toHaveLength(1);
    await store.flush();
    expect(stored(vault, 'sound-x')).toMatchObject({ format: SOUND_RECORD_FORMAT, id: 'sound-x', audioPath: 'Audio/Rain.mp3' });
  });

  it('where a file already stands at that path, what it holds stays', async () => {
    const { vault, store } = await open();
    store.add([record('sound-x', 'Audio/Rain.mp3') as never]);
    vault.files.set(pathOf('sound-x'), file('sound-x', 'Audio/Rain.mp3', { credit: 'other device' }));
    await store.flush();
    expect(stored(vault, 'sound-x')).toMatchObject({ credit: 'other device' });
  });

  it('keeps keys it does not know, and applies a change to what the file holds then', async () => {
    const { vault, store } = await open({ [pathOf('a')]: file('a', 'Audio/Rain.mp3', { future: { stems: 3 } }) });
    vault.files.set(pathOf('a'), file('a', 'Audio/Rain.mp3', { future: { stems: 3 }, other: 'device' }));
    store.update(['a'], { credit: 'Mine' }, 9);
    await store.flush();
    expect(stored(vault, 'a')).toMatchObject({ credit: 'Mine', future: { stems: 3 }, other: 'device', modifiedAt: 9 });
  });

  it('removes a field given as undefined', async () => {
    const { vault, store } = await open({ [pathOf('a')]: file('a', 'Audio/Rain.mp3', { credit: 'x' }) });
    store.update(['a'], { credit: undefined });
    await store.flush();
    expect('credit' in stored(vault, 'a')).toBe(false);
  });

  it('reads a newer Atlas\' record and never rewrites it, not for a rename either', async () => {
    const text = JSON.stringify({ format: SOUND_RECORD_FORMAT + 1, ...record('a', 'Audio/Rain.mp3') });
    const { vault, store } = await open({ [pathOf('a')]: text });
    expect(store.all().map((sound) => sound.name)).toEqual(['Rain']);
    store.update(['a'], { credit: 'Mine' });
    vault.emit('rename', fileAt('Audio/Storm.mp3'), 'Audio/Rain.mp3');
    await store.flush();
    expect(vault.files.get(pathOf('a'))).toBe(text);
  });

  it('follows the vault\'s rename of a file and of a folder', async () => {
    const { vault, store } = await open({ [pathOf('a')]: file('a', 'Audio/Rain.mp3'), [pathOf('b')]: file('b', 'Audio/Deep/Wind.mp3', { name: 'Wind' }), [pathOf('c')]: file('c', 'Audios/Rain.mp3', { name: 'C' }) });
    vault.emit('rename', fileAt('Audio/Storm.mp3'), 'Audio/Rain.mp3');
    expect(store.all().find((sound) => sound.id === 'a')).toMatchObject({ audioPath: 'Audio/Storm.mp3', name: 'Storm' });
    vault.emit('rename', fileAt('Sound'), 'Audio');
    await store.flush();
    expect(stored(vault, 'b')).toMatchObject({ audioPath: 'Sound/Deep/Wind.mp3', name: 'Wind' });
    expect(stored(vault, 'a')).toMatchObject({ audioPath: 'Sound/Storm.mp3' });
    expect(stored(vault, 'c')).toMatchObject({ audioPath: 'Audios/Rain.mp3' });
  });

  it('leaves a record of a file on a disk alone when the vault renames what is named alike', async () => {
    const { vault, store } = await open({ [pathOf('a')]: file('a', 'atlas-sound:music/Rain.mp3') });
    vault.emit('rename', fileAt('Storm.mp3'), 'music/Rain.mp3');
    await store.flush();
    expect(stored(vault, 'a')).toMatchObject({ audioPath: 'atlas-sound:music/Rain.mp3' });
  });

  it('keeps a record whose audio is gone, which waits for its file', async () => {
    const { vault, store } = await open({ [pathOf('a')]: file('a', 'Audio/Rain.mp3'), 'Audio/Rain.mp3': 'AUDIO' });
    await vault.app.vault.adapter.remove('Audio/Rain.mp3');
    vault.emit('delete', fileAt('Audio/Rain.mp3'));
    await store.flush();
    expect(store.all().map((sound) => sound.id)).toEqual(['a']);
  });

  it('follows another device: a file delivered, changed and deleted', async () => {
    const { vault, store } = await open();
    await vault.app.vault.adapter.write(pathOf('a'), file('a'));
    vault.emit('create', fileAt(pathOf('a')));
    await expect.poll(() => store.all().map((sound) => sound.name)).toEqual(['Rain']);
    await vault.app.vault.adapter.write(pathOf('a'), file('a', 'Audio/Rain.mp3', { name: 'Edited' }));
    vault.emit('modify', fileAt(pathOf('a')));
    await expect.poll(() => store.all().map((sound) => sound.name)).toEqual(['Edited']);
    await vault.app.vault.adapter.remove(pathOf('a'));
    vault.emit('delete', fileAt(pathOf('a')));
    expect(store.all()).toEqual([]);
  });

  it('removes every file that holds a record, a conflict copy too', async () => {
    const { vault, store } = await open({ [pathOf('a')]: file('a'), [`${RECORDS_FOLDER}/a (conflict).json`]: file('a') });
    store.remove('a');
    await store.flush();
    expect(store.all()).toEqual([]);
    expect(vault.app.fileManager.trashFile).toHaveBeenCalledTimes(2);
  });

  it('names a record by its file alone', () => {
    expect(recordIdFor('Audio/Rain.mp3')).toBe(recordIdFor('Audio/Rain.mp3'));
    expect(recordIdFor('Audio/Rain.mp3')).not.toBe(recordIdFor('Audio/Wind.mp3'));
    expect(recordIdFor('Audio/Rain.mp3', 1)).not.toBe(recordIdFor('Audio/Rain.mp3'));
  });
});
