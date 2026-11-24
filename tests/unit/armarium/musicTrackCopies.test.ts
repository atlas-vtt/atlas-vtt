import { describe, expect, it, vi } from 'vitest';
import type { PreparedTrack } from '../../../src/app/armarium/upload/MusicShareSession';
import { prepareTrackCopy, type MusicCopiesDeps } from '../../../src/app/armarium/upload/musicTrackCopies';
import { readAtlasCopy } from '../../../src/app/sound/codec/atlasOpus';
import type { SoundConversion } from '../../../src/app/soundLibrary/soundConversion';
import type { LibraryFile } from '../../../src/app/soundLibrary/SoundLibrary';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { keyOf, plainCopy, taggedCopy } from '../../helpers/atlasCopies';

const file = (path: string): LibraryFile => ({ kind: 'music', path, name: path, size: 1, mtime: 1 });

function rig(originals: 'keep' | null = 'keep'): { deps: MusicCopiesDeps; location: FakeSoundLocation; conversion: { now: SoundConversion }; changed: () => void; request: ReturnType<typeof vi.fn> } {
  const location = new FakeSoundLocation();
  const conversion: { now: SoundConversion } = { now: { state: 'not-converted' } };
  const listeners = new Set<() => void>();
  const request = vi.fn();
  const deps = {
    library: { locationOf: () => location, audioPathOf: (_kind: string, path: string) => `atlas-sound:music/${path}`, pathNow: (path: string) => path, roots: { originalsOf: () => originals } },
    director: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      shelf: {
        stateOf: () => conversion.now,
        infoOf: () => (conversion.now.state === 'ready' ? { key: 'k', frames: 96_000, gainDb: 0 } : null),
        request,
        storedBytes: async () => {
          const bytes = new Uint8Array(await plainCopy().arrayBuffer());
          return { byteLength: bytes.length, read: async (start: number, end: number) => bytes.slice(start, end) };
        },
      },
    },
    records: { whenLoaded: () => Promise.resolve(), all: () => [] },
  } as unknown as MusicCopiesDeps;
  return { deps, location, conversion, changed: () => { for (const listener of listeners) listener(); }, request };
}

const told = (): { states: PreparedTrack[]; listener: (state: PreparedTrack) => void } => {
  const states: PreparedTrack[] = [];
  return { states, listener: (state) => states.push(state) };
};

describe('preparing a track for the Armarium', () => {
  it('reads an Atlas copy as it is, and hands it on as players get it', async () => {
    const { deps, location, request } = rig();
    location.put('Dawn.opus', await taggedCopy({ key: keyOf('a') }));
    const { states, listener } = told();
    prepareTrackCopy(deps, file('Dawn.opus'), listener);
    await vi.waitFor(() => expect(states.at(-1)?.state).toBe('ready'));
    const last = states.at(-1);
    if (last?.state !== 'ready') throw new Error('not ready');
    expect(last.frames).toBeGreaterThan(0);
    expect(await readAtlasCopy(last.copy)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('converts any other file through the copy shelf, as a press does, and says how far it is', async () => {
    const { deps, location, conversion, changed, request } = rig();
    location.put('Dawn.mp3', new Blob(['ID3 not opus']));
    const { states, listener } = told();
    prepareTrackCopy(deps, file('Dawn.mp3'), listener);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith([expect.objectContaining({ filePath: 'atlas-sound:music/Dawn.mp3' })], true));
    conversion.now = { state: 'converting', progress: 0.4 };
    changed();
    changed();
    conversion.now = { state: 'ready' };
    changed();
    await vi.waitFor(() => expect(states.at(-1)?.state).toBe('ready'));
    expect(states.map((state) => (state.state === 'converting' ? `converting ${state.progress}` : state.state))).toEqual(['reading', 'converting null', 'converting 0.4', 'ready']);
  });

  it('converts nothing in a folder the GM has not decided for, and names a file that is gone', async () => {
    const waiting = rig(null);
    waiting.location.put('Dawn.mp3', new Blob(['ID3']));
    const first = told();
    prepareTrackCopy(waiting.deps, file('Dawn.mp3'), first.listener);
    await vi.waitFor(() => expect(first.states.at(-1)).toEqual({ state: 'refused', reason: 'consent' }));
    expect(waiting.request).not.toHaveBeenCalled();

    const gone = told();
    prepareTrackCopy(rig().deps, file('Gone.mp3'), gone.listener);
    await vi.waitFor(() => expect(gone.states.at(-1)).toEqual({ state: 'refused', reason: 'gone' }));
  });

  it('says a read failed, never that the file is damaged, where its copy cannot be read, and logs why', async () => {
    const { deps, location, conversion, changed } = rig();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (deps.director.shelf as { storedBytes: () => Promise<never> }).storedBytes = () => Promise.reject(new Error('EBUSY'));
    location.put('Dawn.mp3', new Blob(['ID3 not opus']));
    const { states, listener } = told();
    prepareTrackCopy(deps, file('Dawn.mp3'), listener);
    await vi.waitFor(() => expect(states.at(-1)?.state).toBe('converting'));
    conversion.now = { state: 'ready' };
    changed();
    await vi.waitFor(() => expect(states.at(-1)).toEqual({ state: 'refused', reason: 'read-failed' }));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('Dawn.mp3'), expect.any(Error));
    errors.mockRestore();
  });

  it('tells nothing more once released', async () => {
    const { deps, location } = rig();
    location.put('Dawn.opus', await taggedCopy({ key: keyOf('b') }));
    const { states, listener } = told();
    prepareTrackCopy(deps, file('Dawn.opus'), listener)();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(states).toEqual([{ state: 'reading' }]);
  });
});
