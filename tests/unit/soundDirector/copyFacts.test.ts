import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundRecord } from '@/app/sound/soundTypes';
import { SoundCopies } from '@/app/soundDirector/soundCopies';
import { LibraryCopyFolder } from '@/app/soundLibrary/libraryCopyFolder';
import { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { externalAudioPath } from '@/app/soundLibrary/soundPaths';
import { SoundRoots } from '@/app/soundLibrary/SoundRoots';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { keyOf, taggedCopy } from '../../helpers/atlasCopies';

/** One answer of the slow disk: far under the time a sound's reads may take, far over it for all of them in a row. */
const ANSWER_MS = 1000;
const FILES = 50;

let library: SoundLibrary;
let location: FakeSoundLocation;

const sound = (index: number): SoundRecord => ({ id: `s${index}`, name: `T${index}`, kind: 'music', filePath: externalAudioPath('music', `F${index}/T${index}.opus`) });

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('self', globalThis);
  vi.useFakeTimers();
  location = new FakeSoundLocation();
  const roots = new SoundRoots({
    shared: () => ({ music: { type: 'external' } }),
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: (kind) => (kind === 'music' ? '/Music' : null),
    setLocal: () => undefined,
    localOriginals: () => 'trash',
    setLocalOriginals: () => undefined,
    vaultBase: () => '/vault',
    realPath: async (path) => path,
  });
  library = new SoundLibrary({ roots, open: () => location, probeSeconds: async () => null });
});

afterEach(() => {
  library.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('reading what a large library on a slow disk says of itself', () => {
  it('times each sound from when its reads begin: none is taken for stuck, none converted, and a press reads first', async () => {
    const copy = await taggedCopy({ key: keyOf('a') });
    for (let index = 0; index < FILES; index++) location.put(`F${index}/T${index}.opus`, copy);
    const readRange = location.readRange.bind(location);
    const order: string[] = [];
    vi.spyOn(location, 'readRange').mockImplementation(async (path, start, end) => {
      order.push(path);
      await new Promise((resolve) => setTimeout(resolve, ANSWER_MS));
      return readRange(path, start, end);
    });
    const run = vi.fn(() => new Promise<never>(() => undefined));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const copies = new SoundCopies(
      { statOf: (record) => library.statOfFile(record.filePath), read: () => Promise.resolve(new Blob(['source'])), pathNow: (record) => record.filePath },
      new LibraryCopyFolder(() => library, { whenLoaded: async () => undefined, rewrite: () => false }),
      { run },
      async (source) => ({ hash: keyOf('b'), source: source instanceof Blob ? source : new Blob([source]) }),
      () => undefined,
      3,
    );
    await library.settle('music', Array.from({ length: FILES }, (_, index) => `F${index}`));
    for (let index = 0; index < FILES; index++) await library.settle('music', [`F${index}/T${index}.opus`]);
    const sounds = Array.from({ length: FILES }, (_, index) => sound(index));
    expect(sounds.every((record) => library.statOfFile(record.filePath) !== null)).toBe(true);

    copies.request(sounds);
    await vi.advanceTimersByTimeAsync(ANSWER_MS);
    copies.request([sounds[FILES - 1]!], true);
    await vi.advanceTimersByTimeAsync(FILES * 3 * ANSWER_MS);

    expect(sounds.map((record) => copies.stateOf(record).state)).toEqual(sounds.map(() => 'ready'));
    expect(run).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(order.indexOf(`F${FILES - 1}/T${FILES - 1}.opus`)).toBeLessThan(3 * 8);
    copies.dispose();
  });
});
