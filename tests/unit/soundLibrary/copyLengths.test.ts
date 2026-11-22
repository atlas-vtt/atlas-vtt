// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { fakeLibrary } from '../../helpers/libraryRig';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

afterEach(() => vi.restoreAllMocks());

describe('the length of an Atlas copy', () => {
  it('comes from the frames its header gave when it was read, at the size it was read at, without a read of its own', () => {
    const { app } = createInMemoryApp({ folders: [] });
    const seconds = vi.fn(() => 5);
    const { library } = fakeLibrary(app, { local: { music: '/m' }, seconds });
    const copy = { kind: 'music' as const, name: 'Song.opus', path: 'Set/Song.opus', size: 900, mtime: 1 };
    library.copies.note('music', copy.path, 'Song.flac', 900, 48_000 * 90);
    expect(library.knowsSeconds(copy)).toBe(true);
    expect(library.secondsOf(copy, true)).toBe(90);
    expect(library.secondsOf({ ...copy, size: 901 })).toBeUndefined();
    expect(seconds).toHaveBeenCalledTimes(1);
    SoundLibrary.release(app);
  });
});
