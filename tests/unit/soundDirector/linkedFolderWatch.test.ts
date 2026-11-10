// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundKind, SoundRecord } from '@/app/sound/soundTypes';
import type { SoundDirector } from '@/app/soundDirector/SoundDirector';
import { REQUEST_BATCH } from '@/app/soundDirector/libraryDesk';
import { LinkedFolderWatch } from '@/app/soundDirector/linkedFolderWatch';
import type { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import type { OriginalsChoice } from '@/app/soundLibrary/SoundRoots';

interface Rig {
  watch: () => LinkedFolderWatch;
  asked: string[][];
  files: Record<SoundKind, string[]>;
  changed: () => void;
  setOn: (on: boolean) => void;
  choose: (kind: SoundKind, choice: OriginalsChoice) => void;
}

function rig(): Rig {
  const files: Record<SoundKind, string[]> = { music: [], ambience: [] };
  const choices: Record<SoundKind, OriginalsChoice | null> = { music: null, ambience: null };
  const asked: string[][] = [];
  let libraryListener = (): void => undefined;
  let rootsListener = (): void => undefined;
  let directorListener = (): void => undefined;
  let on = true;
  const library = {
    filesOf: (kind: SoundKind) => files[kind].map((path) => ({ entry: { path, name: path, size: 1, mtime: 1 }, words: path, order: path })),
    onChange: (listener: () => void) => { libraryListener = listener; return () => undefined; },
    roots: {
      originalsOf: (kind: SoundKind) => choices[kind],
      onChange: (listener: () => void) => { rootsListener = listener; return () => undefined; },
    },
    audioPathOf: (_kind: SoundKind, path: string) => path,
    pathNow: (path: string) => path,
  } as unknown as SoundLibrary;
  const director = {
    get isOn() { return on; },
    subscribe: (listener: () => void) => { directorListener = listener; return () => undefined; },
    shelf: { request: (records: readonly SoundRecord[]) => { asked.push(records.map((record) => record.filePath)); } },
  } as unknown as SoundDirector;
  const records = { whenLoaded: () => Promise.resolve(), all: () => [], add: () => Promise.resolve() } as never;
  return {
    watch: () => new LinkedFolderWatch({ records, library, director }),
    asked,
    files,
    changed: () => libraryListener(),
    setOn: (value) => { on = value; directorListener(); },
    choose: (kind, choice) => { choices[kind] = choice; rootsListener(); },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the linked folders', () => {
  it('are prepared whole once linked, and then each file that turns up, once', async () => {
    const r = rig();
    r.files.music = ['a.mp3', 'b.mp3'];
    const watch = r.watch();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([['a.mp3', 'b.mp3']]);
    // A folder copied in arrives as many changes, taken together once they rest.
    r.files.ambience = ['rain/1.ogg'];
    r.changed();
    r.files.ambience = ['rain/1.ogg', 'rain/2.ogg'];
    r.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([['a.mp3', 'b.mp3'], ['rain/1.ogg', 'rain/2.ogg']]);
    r.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toHaveLength(2);
    watch.dispose();
  });

  it('wait while sound is off, and look at everything again once it is on', async () => {
    const r = rig();
    r.files.music = ['a.mp3'];
    r.setOn(false);
    const watch = r.watch();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([]);
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([['a.mp3']]);
    watch.dispose();
  });

  it('look again at a file that left and came back', async () => {
    const r = rig();
    r.files.music = ['a.mp3'];
    const watch = r.watch();
    await vi.advanceTimersByTimeAsync(2000);
    r.files.music = [];
    r.changed();
    await vi.advanceTimersByTimeAsync(2000);
    r.files.music = ['a.mp3'];
    r.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([['a.mp3'], ['a.mp3']]);
    watch.dispose();
  });

  it('asks for every file of a large folder, a batch at a time', async () => {
    const r = rig();
    r.files.music = Array.from({ length: 2000 }, (_, at) => `track ${String(at).padStart(4, '0')}.mp3`);
    const watch = r.watch();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked.flat()).toEqual(r.files.music);
    expect(Math.max(...r.asked.map((batch) => batch.length))).toBeLessThanOrEqual(REQUEST_BATCH);
    watch.dispose();
  });

  it('ask again for a whole folder once the GM gives its choice', async () => {
    const r = rig();
    r.files.music = ['a.mp3', 'b.mp3'];
    r.files.ambience = ['rain.ogg'];
    const watch = r.watch();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([['a.mp3', 'b.mp3', 'rain.ogg']]);
    r.choose('music', 'keep');
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toEqual([['a.mp3', 'b.mp3', 'rain.ogg'], ['a.mp3', 'b.mp3']]);
    // The choice stands: nothing is asked again until something new turns up.
    r.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.asked).toHaveLength(2);
    watch.dispose();
  });
});
