import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAtlasCopy, withComments } from '../../../src/app/sound/codec/atlasOpus';
import { SoundImportError } from '../../../src/app/sound/codec/demux/demuxTypes';
import type { SoundRecord } from '../../../src/app/sound/soundTypes';
import { LibraryCopyFolder } from '../../../src/app/soundLibrary/libraryCopyFolder';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { externalAudioPath } from '../../../src/app/soundLibrary/soundPaths';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';
import { SoundRoots, type OriginalsChoice } from '../../../src/app/soundLibrary/SoundRoots';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { keyOf, plainCopy, taggedCopy } from '../../helpers/atlasCopies';

const KEY = keyOf('a');
const at = (path: string): string => externalAudioPath('music', path);

let location: FakeSoundLocation;
let library: SoundLibrary;
let choice: OriginalsChoice | null;
let stored: StoredSound[];
let folder: LibraryCopyFolder;

function sound(path: string, id = `sound-${path}`): SoundRecord {
  return { id, name: path, kind: 'music', filePath: at(path) };
}

function storedSound(path: string): StoredSound {
  return { id: `sound-${path}`, name: 'Tavern', tags: [], createdAt: 1, modifiedAt: 1, audioPath: at(path), kind: 'music' };
}

const records = {
  whenLoaded: (): Promise<void> => Promise.resolve(),
  rewrite: (change: (sound: StoredSound) => StoredSound | null): boolean => {
    let changed = false;
    stored = stored.map((one) => {
      const next = change(one);
      changed ||= next !== null;
      return next ?? one;
    });
    return changed;
  },
};

const stat = (path: string): { size: number; mtime: number } => {
  const entry = location.files.get(path);
  if (!entry) throw new Error(`${path} is not there`);
  return { size: entry.size, mtime: entry.mtime };
};

afterEach(() => {
  library.destroy();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  location = new FakeSoundLocation();
  location.blobOf = (path) => Promise.reject(new Error(`${path} is not there`));
  choice = 'trash';
  stored = [];
  const roots = new SoundRoots({
    shared: () => ({ music: { type: 'external' } }),
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: (kind) => (kind === 'music' ? '/Music' : null),
    setLocal: () => undefined,
    localOriginals: () => choice,
    setLocalOriginals: () => undefined,
    vaultBase: () => '/vault',
    realPath: async (path) => path,
  });
  library = new SoundLibrary({ roots, open: () => location, probeSeconds: async () => null });
  folder = new LibraryCopyFolder(() => library, records, () => 5);
});

describe('storing a copy', () => {
  it('the source goes to the trash only after the copy stands under its name', async () => {
    location.put('Inn/Tavern.mp3', new Blob(['MP3']));
    const copy = await taggedCopy({ key: KEY });
    expect(await folder.store(sound('Inn/Tavern.mp3'), copy, 'trash', stat('Inn/Tavern.mp3'))).toBe(at('Inn/Tavern.opus'));
    expect(location.changes).toEqual(['write Inn/Tavern.mp3.atlas-part', 'move Inn/Tavern.mp3.atlas-part Inn/Tavern.opus', 'trash Inn/Tavern.mp3']);
    expect(location.contents.get('Inn/Tavern.opus')).toBe(copy);
  });

  it('the GM\'s own X.opus is replaced through a free name', async () => {
    location.put('X.opus', plainCopy());
    const copy = await taggedCopy({ key: KEY, from: 'X.opus' });
    expect(await folder.store(sound('X.opus'), copy, 'trash', stat('X.opus'))).toBe(at('X.opus'));
    expect(location.changes).toEqual(['write X.opus.atlas-part', 'move X.opus.atlas-part X 2.opus', 'trash X.opus', 'move X 2.opus X.opus']);
    expect(location.contents.get('X.opus')).toBe(copy);
  });

  it('a leftover part is trashed before writing', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    location.put('Tavern.mp3.atlas-part', new Blob(['half a copy']));
    await folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'));
    expect(location.changes.slice(0, 2)).toEqual(['trash Tavern.mp3.atlas-part', 'write Tavern.mp3.atlas-part']);
    expect(location.files.has('Tavern.opus')).toBe(true);
  });

  it('a copy that did not land whole leaves the source and is refused', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    const write = location.write.bind(location);
    vi.spyOn(location, 'write').mockImplementation((path, content) => write(path, content.slice(0, Math.floor(content.size / 2))));
    await expect(folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'))).rejects.toMatchObject({ reason: 'verify-failed' });
    expect(location.files.has('Tavern.mp3')).toBe(true);
    expect(location.files.has('Tavern.opus')).toBe(false);
    expect(location.changes).not.toContain('trash Tavern.mp3');
  });

  it('the GM\'s own X.opus replaced keeps its record and gives it the copy\'s size', async () => {
    location.put('X.opus', plainCopy());
    stored = [storedSound('X.opus')];
    const copy = await taggedCopy({ key: KEY, from: 'X.opus' });
    await folder.store(sound('X.opus'), copy, 'trash', stat('X.opus'));
    expect(stored[0]).toMatchObject({ audioPath: at('X.opus'), audioSize: copy.size });
  });

  it('where the folder has no trash, a leftover part is written over', async () => {
    location.trashable = false;
    location.put('Tavern.mp3', new Blob(['MP3']));
    location.put('Tavern.mp3.atlas-part', new Blob(['half a copy']));
    await folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'));
    expect(location.changes).toEqual(['replace Tavern.mp3.atlas-part', 'move Tavern.mp3.atlas-part Tavern.opus']);
    expect(location.files.has('Tavern.mp3')).toBe(true);
  });

  it('a source that changed while converting is kept', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']), 1);
    const before = stat('Tavern.mp3');
    location.put('Tavern.mp3', new Blob(['MP3, synced again']), 2);
    await folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', before);
    expect(location.files.has('Tavern.mp3')).toBe(true);
    expect(location.files.has('Tavern.opus')).toBe(true);
    expect(location.changes).not.toContain('trash Tavern.mp3');
  });

  it('a write failure leaves the source', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    location.failing = (change) => (change.startsWith('write') ? new Error('ENOSPC') : null);
    const failure = folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'));
    await expect(failure).rejects.toBeInstanceOf(SoundImportError);
    await expect(failure).rejects.toMatchObject({ reason: 'cannot-write' });
    expect(location.files.has('Tavern.mp3')).toBe(true);
    expect(location.changes).toEqual([]);
  });

  it('a move failure leaves the source, and takes its part away', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    location.failing = (change) => (change.startsWith('move') ? new Error('EACCES') : null);
    await expect(folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'))).rejects.toMatchObject({ reason: 'cannot-write' });
    expect(location.files.has('Tavern.mp3')).toBe(true);
    expect(location.files.has('Tavern.mp3.atlas-part')).toBe(false);
  });

  it('keep leaves the source; no trash leaves the source', async () => {
    location.put('A.mp3', new Blob(['MP3']));
    await folder.store(sound('A.mp3'), await taggedCopy({ key: KEY, from: 'A.mp3' }), 'keep', stat('A.mp3'));
    location.trashable = false;
    location.put('B.mp3', new Blob(['MP3']));
    await folder.store(sound('B.mp3'), await taggedCopy({ key: keyOf('b'), from: 'B.mp3' }), 'trash', stat('B.mp3'));
    expect([...location.files.keys()].sort()).toEqual(['A.mp3', 'A.opus', 'B.mp3', 'B.opus']);
    expect(location.changes.filter((change) => change.startsWith('trash'))).toEqual([]);
  });

  it('records follow the copy', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    stored = [storedSound('Tavern.mp3'), storedSound('Other.mp3')];
    const copy = await taggedCopy({ key: KEY });
    await folder.store(sound('Tavern.mp3'), copy, 'trash', stat('Tavern.mp3'));
    expect(stored[0]).toMatchObject({ id: 'sound-Tavern.mp3', audioPath: at('Tavern.opus'), audioSize: copy.size, name: 'Tavern', modifiedAt: 5 });
    expect(stored[1]).toEqual(storedSound('Other.mp3'));
  });

  it('a copy another device stored first is used, not duplicated', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    const theirs = await taggedCopy({ key: KEY });
    location.put('Tavern.opus', theirs);
    expect(await folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'))).toBe(at('Tavern.opus'));
    expect([...location.files.keys()]).toEqual(['Tavern.opus']);
    expect(location.contents.get('Tavern.opus')).toBe(theirs);
    expect(location.changes).toEqual(['write Tavern.mp3.atlas-part', 'trash Tavern.mp3.atlas-part', 'trash Tavern.mp3']);
  });
});

describe('what a file says of itself', () => {
  it('a tagged file gives its facts, read from its first pages and its last', async () => {
    const copy = await taggedCopy({ key: KEY });
    location.put('Tavern.opus', copy);
    const found = await folder.factsOf(sound('Tavern.opus'));
    expect(found).toEqual({ facts: await readAtlasCopy(copy), audioPath: at('Tavern.opus') });
    expect(location.reads).toEqual([]);
    expect(location.ranges.length).toBeGreaterThan(0);
  });

  it('a source says nothing', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    location.put('Mine.opus', plainCopy());
    expect(await folder.factsOf(sound('Tavern.mp3'))).toBeNull();
    expect(await folder.factsOf(sound('Mine.opus'))).toBeNull();
  });

  it('a kept original gives the copy made of it beside it', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    location.put('Tavern.opus', await taggedCopy({ key: keyOf('9'), from: 'Other.wav' }));
    location.put('Tavern 2.opus', await taggedCopy({ key: KEY, from: 'Tavern.mp3' }));
    expect(await folder.factsOf(sound('Tavern.mp3'))).toMatchObject({ facts: { key: KEY }, audioPath: at('Tavern 2.opus') });
  });

  it('a record of Tavern.mp3 plays the copy that took its place on this device', async () => {
    location.put('Tavern.opus', await taggedCopy({ key: KEY, from: 'Tavern.mp3' }));
    await library.reread('music');
    expect(await folder.factsOf(sound('Tavern.mp3'))).toMatchObject({ facts: { key: KEY }, audioPath: at('Tavern.opus') });
  });

  it('a record of Tavern.opus converts Tavern.mp3 on a device that has not yet, and stays as it is', async () => {
    location.put('Tavern.mp3', new Blob(['MP3']));
    stored = [storedSound('Tavern.opus')];
    await library.reread('music');
    expect(folder.choiceFor(sound('Tavern.opus'))).toBe('trash');
    expect(await folder.factsOf(sound('Tavern.opus'))).toBeNull();
    expect(await folder.store(sound('Tavern.opus'), await taggedCopy({ key: KEY }), 'trash', stat('Tavern.mp3'))).toBe(at('Tavern.opus'));
    expect(location.changes).toEqual(['write Tavern.mp3.atlas-part', 'move Tavern.mp3.atlas-part Tavern.opus', 'trash Tavern.mp3']);
    expect(stored).toEqual([storedSound('Tavern.opus')]);
  });

  it('a kept original whose copy is known is never converted, and is stored as itself where it is', async () => {
    choice = 'keep';
    location.put('Tavern.mp3', new Blob(['MP3']));
    const copy = await taggedCopy({ key: KEY, from: 'Tavern.mp3' });
    location.put('Tavern.opus', copy);
    await library.reread('music');
    expect(folder.choiceFor(sound('Tavern.mp3')), 'not yet known: it may convert').toBe('keep');
    await folder.factsOf(sound('Tavern.opus'));
    expect(folder.choiceFor(sound('Tavern.mp3'))).toBeNull();
    expect(await folder.store(sound('Tavern.mp3'), copy, 'keep', stat('Tavern.mp3'))).toBe(at('Tavern.opus'));
    expect(location.changes).toEqual(['write Tavern.mp3.atlas-part', 'trash Tavern.mp3.atlas-part']);
    expect(location.files.has('Tavern 2.opus')).toBe(false);
  });

  it('a file Atlas marked whose facts do not read is refused as damaged', async () => {
    location.put('Tavern.opus', await withComments(await taggedCopy({ key: KEY }), (comment) => !comment.startsWith('ATLAS_LUFS'), ['ATLAS_LUFS=?']));
    await expect(folder.factsOf(sound('Tavern.opus'))).rejects.toMatchObject({ reason: 'unreadable' });
  });

  it('a race between devices: of two copies of one source, the one named after it stays', async () => {
    location.put('Tavern.opus', await taggedCopy({ key: KEY, from: 'Tavern.mp3' }));
    location.put('Tavern 2.opus', await taggedCopy({ key: KEY, from: 'Tavern.mp3' }));
    stored = [storedSound('Tavern 2.opus')];
    expect(await folder.factsOf(sound('Tavern 2.opus'))).toMatchObject({ audioPath: at('Tavern 2.opus') });
    expect(await folder.factsOf(sound('Tavern.opus'))).toMatchObject({ audioPath: at('Tavern.opus') });
    expect(location.changes).toEqual(['trash Tavern 2.opus']);
    expect(stored[0]?.audioPath).toBe(at('Tavern.opus'));
    expect(await folder.factsOf(sound('Tavern 2.opus'))).toBeNull();
  });

  it('identical sources under two names keep both copies, whatever the choice', async () => {
    for (const chosen of ['keep', 'trash'] as const) {
      choice = chosen;
      location = new FakeSoundLocation();
      library.destroy();
      library = new SoundLibrary({ roots: library.roots, open: () => location, probeSeconds: async () => null });
      folder = new LibraryCopyFolder(() => library, records, () => 5);
      location.put('Tavern.mp3', new Blob(['MP3']));
      location.put('Tavern copy.mp3', new Blob(['MP3']));
      await folder.store(sound('Tavern.mp3'), await taggedCopy({ key: KEY, from: 'Tavern.mp3' }), chosen, stat('Tavern.mp3'));
      await folder.store(sound('Tavern copy.mp3'), await taggedCopy({ key: KEY, from: 'Tavern copy.mp3' }), chosen, stat('Tavern copy.mp3'));
      for (const path of ['Tavern.opus', 'Tavern copy.opus', 'Tavern.mp3', 'Tavern copy.mp3']) await folder.factsOf(sound(path));
      expect(location.files.has('Tavern.opus') && location.files.has('Tavern copy.opus')).toBe(true);
      expect(location.changes.filter((change) => change.startsWith('trash') && change.endsWith('.opus'))).toEqual([]);
    }
  });

  it('a path once holding a copy and now another file is left alone', async () => {
    location.put('Tavern.opus', await taggedCopy({ key: KEY, from: 'Tavern.mp3' }));
    location.put('Tavern 2.opus', await taggedCopy({ key: KEY, from: 'Tavern.mp3' }));
    await folder.factsOf(sound('Tavern 2.opus'));
    location.put('Tavern 2.opus', plainCopy(), 2);
    await folder.factsOf(sound('Tavern.opus'));
    expect(location.changes).toEqual([]);
    expect(location.files.has('Tavern 2.opus')).toBe(true);
  });

  it('knows a file outside every linked folder, and reads nothing of it', async () => {
    const elsewhere = { ...sound('x'), filePath: 'Elsewhere/x.mp3' };
    expect(folder.outside(elsewhere)).toBe(true);
    expect(folder.outside(sound('Tavern.mp3'))).toBe(false);
    expect(await folder.factsOf(elsewhere)).toBeNull();
    expect(location.ranges).toEqual([]);
  });

  it('the choice is the root\'s, and none outside every root', () => {
    expect(folder.choiceFor(sound('Tavern.mp3'))).toBe('trash');
    choice = 'keep';
    expect(folder.choiceFor(sound('Tavern.mp3'))).toBe('keep');
    choice = null;
    expect(folder.choiceFor(sound('Tavern.mp3'))).toBeNull();
    choice = 'trash';
    expect(folder.choiceFor({ ...sound('x'), filePath: 'Elsewhere/x.mp3' })).toBeNull();
  });

  it('a copy plays from its file', async () => {
    const copy = await taggedCopy({ key: KEY });
    location.put('Tavern.opus', copy);
    expect(await folder.blob(at('Tavern.opus'))).toBe(copy);
    await expect(folder.blob(at('Gone.opus'))).rejects.toThrow();
  });

  it('reads no more than a few files at once', async () => {
    let reading = 0;
    let most = 0;
    const readRange = location.readRange.bind(location);
    vi.spyOn(location, 'readRange').mockImplementation(async (path, start, end) => {
      most = Math.max(most, ++reading);
      await new Promise((resolve) => setTimeout(resolve, 1));
      reading--;
      return readRange(path, start, end);
    });
    const copy = await taggedCopy({ key: KEY });
    for (let index = 0; index < 40; index++) location.put(`F${index}/T.opus`, copy);
    await Promise.all(Array.from({ length: 40 }, (_, index) => folder.factsOf(sound(`F${index}/T.opus`))));
    expect(location.changes).toEqual([]);
    expect(most).toBeLessThanOrEqual(8);
  });
});
