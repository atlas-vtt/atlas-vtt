import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import { MOOD_FORMAT } from '../../../src/app/soundLibrary/moodFile';
import { MOODS_FOLDER } from '../../../src/app/soundLibrary/soundFiles';
import type { Mood } from '../../../src/app/sound/soundTypes';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const FOLDER = MOODS_FOLDER;
const moodPath = (id: string): string => `${FOLDER}/${id}.json`;

const file = (id: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: 1, id, name: id.toUpperCase(), order: 1, fadeSeconds: 4, music: 'keep', layers: [], ...extra });

const MIX: Omit<Mood, 'id' | 'order'> = { name: 'Tavern', fadeSeconds: 4, music: 'none', layers: [{ sound: 's1', levelDb: -3 }] };

const stores: InMemoryApp[] = [];

async function open(files: Record<string, string> = {}): Promise<{ vault: InMemoryApp; store: MoodStore }> {
  const vault = createInMemoryApp({ files, folders: [FOLDER] });
  stores.push(vault);
  const store = MoodStore.forApp(vault.app);
  await store.whenLoaded();
  return { vault, store };
}

const stored = (vault: InMemoryApp, path: string): Record<string, unknown> => JSON.parse(vault.files.get(path)!) as Record<string, unknown>;

function fileAt(vault: InMemoryApp, path: string): TFile {
  const target = new TFile(path);
  target.stat = { ctime: 0, mtime: 0, size: (vault.files.get(path) ?? '').length };
  return target;
}

afterEach(() => {
  for (const vault of stores.splice(0)) MoodStore.release(vault.app);
});

describe('MoodStore', () => {
  it('reads the moods in their order, the same array while nothing changed', async () => {
    const { store } = await open({
      [moodPath('b')]: file('b', { order: 2 }),
      [moodPath('a')]: file('a', { order: 1 }),
      [moodPath('c')]: file('c', { order: 3 }),
    });
    expect(store.moods().map((mood) => mood.id)).toEqual(['a', 'b', 'c']);
    expect(store.moods()).toBe(store.moods());
    expect(store.isLoaded()).toBe(true);
  });

  it('reads an invalid file as nothing and leaves it alone', async () => {
    const broken = '{ not json';
    const { vault, store } = await open({ [moodPath('bad')]: broken, [moodPath('noname')]: JSON.stringify({ id: 'noname', order: 1 }), [moodPath('good')]: file('good') });
    expect(store.moods().map((mood) => mood.id)).toEqual(['good']);
    const created = store.createMood(MIX);
    await store.flush();
    expect(vault.files.get(moodPath('bad'))).toBe(broken);
    expect(vault.files.get(moodPath(created.id))).toBeDefined();
  });

  it('writes a new mood after the last, named by its id', async () => {
    const { vault, store } = await open({ [moodPath('a')]: file('a', { order: 5 }) });
    const mood = store.createMood(MIX);
    await store.flush();
    expect(mood.order).toBe(6);
    expect(stored(vault, moodPath(mood.id))).toMatchObject({ format: MOOD_FORMAT, id: mood.id, name: 'Tavern', order: 6, music: 'none' });
    expect(store.mood(mood.id)?.layers).toEqual([{ sound: 's1', levelDb: -3 }]);
  });

  it('keeps keys it does not know when a mood is saved', async () => {
    const { vault, store } = await open({ [moodPath('a')]: file('a', { future: { stems: 3 } }) });
    const mood = store.mood('a')!;
    expect(store.saveMood({ ...mood, name: 'Renamed' })).toBe(true);
    await store.flush();
    expect(stored(vault, moodPath('a'))).toMatchObject({ name: 'Renamed', future: { stems: 3 } });
    expect(vault.files.has(moodPath('Renamed'))).toBe(false);
  });

  it('applies a save to what the file holds then, so a key another device wrote survives', async () => {
    const { vault, store } = await open({ [moodPath('a')]: file('a') });
    const mood = store.mood('a')!;
    vault.files.set(moodPath('a'), file('a', { other: 'device' }));
    store.saveMood({ ...mood, name: 'Mine' });
    await store.flush();
    expect(stored(vault, moodPath('a'))).toMatchObject({ name: 'Mine', other: 'device' });
  });

  it('reads a newer Atlas\' mood and never rewrites it', async () => {
    const text = file('a', { format: MOOD_FORMAT + 1, later: true });
    const { vault, store } = await open({ [moodPath('a')]: text });
    const mood = store.mood('a')!;
    expect(mood.name).toBe('A');
    expect(store.isReadOnly('a')).toBe(true);
    expect(store.saveMood({ ...mood, name: 'Mine' })).toBe(false);
    await store.flush();
    expect(vault.files.get(moodPath('a'))).toBe(text);
  });

  it('refuses to save a mood no file holds', async () => {
    const { store } = await open();
    expect(store.saveMood({ ...MIX, id: 'gone', order: 1 })).toBe(false);
  });

  it('removes every file that holds a mood, a conflict copy too', async () => {
    const { vault, store } = await open({ [moodPath('a')]: file('a'), [`${FOLDER}/a (conflict).json`]: file('a', { name: 'Copy' }) });
    store.removeMood('a');
    await store.flush();
    expect(store.moods()).toEqual([]);
    expect(vault.app.fileManager.trashFile).toHaveBeenCalledTimes(2);
  });

  it('where two files hold one id, every device picks the same', async () => {
    const files = { [moodPath('a')]: file('a', { name: 'Named' }), [`${FOLDER}/a (conflict).json`]: file('a', { name: 'Copy' }) };
    const first = await open(files);
    const second = await open(Object.fromEntries(Object.entries(files).reverse()));
    expect(first.store.mood('a')?.name).toBe(second.store.mood('a')?.name);
  });

  it('follows another device: a file delivered, changed and deleted', async () => {
    const { vault, store } = await open();
    let heard = 0;
    store.onChange(() => { heard++; });

    await vault.app.vault.adapter.write(moodPath('a'), file('a'));
    vault.emit('create', fileAt(vault, moodPath('a')));
    await expect.poll(() => store.mood('a')?.name).toBe('A');

    await vault.app.vault.adapter.write(moodPath('a'), file('a', { name: 'Edited' }));
    vault.emit('modify', fileAt(vault, moodPath('a')));
    await expect.poll(() => store.mood('a')?.name).toBe('Edited');

    await vault.app.vault.adapter.remove(moodPath('a'));
    vault.emit('delete', fileAt(vault, moodPath('a')));
    expect(store.mood('a')).toBeNull();
    expect(heard).toBeGreaterThan(2);
  });

  it('ignores files beside the moods folder and below it', async () => {
    const { store } = await open({ [`${FOLDER}/deep/a.json`]: file('a'), [`${FOLDER}/a.txt`]: file('b'), 'atlas-vtt/sounds/a.json': file('c') });
    expect(store.moods()).toEqual([]);
  });
});
