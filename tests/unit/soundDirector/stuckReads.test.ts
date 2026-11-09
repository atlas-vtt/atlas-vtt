// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSoundPeaks } from '@/app/sound/codec/soundPeaksClient';
import { STUCK_AFTER_MS } from '@/app/sound/codec/stuckWatch';
import type { SoundRecord } from '@/app/sound/soundTypes';
import { backgroundCopies, SoundCopies, type SoundFileAccess } from '@/app/soundDirector/soundCopies';
import { prepareSource, type PreparedSource } from '@/app/soundDirector/sourcePrepare';
import { FakeCopyFolder, factsOf, record } from '../../helpers/soundDirectorRig';

class FakeWorker {
  static made: FakeWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() { FakeWorker.made.push(this); }
  postMessage(): void { /* Whatever a test says it does. */ }
  terminate(): void { this.terminated = true; }
  say(message: unknown): void { this.onmessage?.({ data: message } as MessageEvent<unknown>); }
}

vi.mock('@/app/sound/codec/soundPeaksWorker?worker&inline', () => ({ default: class { constructor() { return new FakeWorker(); } } }));
vi.mock('@/app/soundDirector/sourceWorker?worker&inline', () => ({ default: class { constructor() { return new FakeWorker(); } } }));

function copies(read: SoundFileAccess['read'], prepare: (source: ArrayBuffer | Blob) => Promise<PreparedSource> = () => Promise.resolve({ hash: 'h', source: new Blob([]) }), parallel?: number): { made: SoundCopies; refused: string[]; done: () => string[] } {
  const refused: string[] = [];
  const ran: string[] = [];
  const folder = new FakeCopyFolder();
  const made = new SoundCopies(
    { statOf: () => ({ size: 1, mtime: 1 }), read, pathNow: ({ filePath }) => filePath },
    folder,
    { run: (job) => {
      ran.push(job.kind);
      const bytes = new Blob([]);
      folder.made.set(bytes, factsOf(job.key));
      return Promise.resolve({ bytes, frames: 48000, channels: 2, lufs: -20, truePeakDb: -3, peaks: new Uint8Array(0) });
    } },
    prepare,
    (sound) => refused.push(sound.id),
    parallel,
  );
  return { made, refused, done: () => ran };
}

const NEVER = new Promise<never>(() => undefined);
const A: SoundRecord = record('a');
const B: SoundRecord = record('b');

beforeEach(() => {
  FakeWorker.made = [];
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a read that never answers', () => {
  it('fails its sound, and holds up no other meanwhile', async () => {
    const { made, refused, done } = copies(({ filePath }) => (filePath === A.filePath ? NEVER : Promise.resolve(new ArrayBuffer(1))));
    made.request([A, B], true);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS - 1000);
    expect(refused).toEqual([]);
    expect(done()).toEqual(['ambience']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refused).toEqual(['a']);
    expect(made.stateOf(A)).toEqual({ state: 'refused', reason: 'unreadable' });
    expect(done()).toEqual(['ambience']);
  });

  it('is no read that keeps getting somewhere, however long it takes', async () => {
    let finish: (buffer: ArrayBuffer) => void = () => undefined;
    let step: (() => void) | undefined;
    const { made, refused } = copies((_sound, onStep) => {
      step = onStep;
      return new Promise((resolve) => { finish = resolve; });
    });
    made.request([A], true);
    await vi.advanceTimersByTimeAsync(0);
    for (let at = 0; at < 5; at++) {
      await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS - 1000);
      step?.();
    }
    expect(refused).toEqual([]);
    finish(new ArrayBuffer(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(made.stateOf(A).state).toBe('ready');
  });

  it('holds nothing up in preparing either: the queue goes on past it', async () => {
    const { made, refused, done } = copies(({ filePath }) => Promise.resolve(new ArrayBuffer(filePath === A.filePath ? 1 : 2)), (source) => (source.byteLength === 1 ? prepareSource(source) : Promise.resolve({ hash: 'h', source: new Blob([]) })));
    made.request([A, B], true);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS + 1000);
    expect(FakeWorker.made[0]?.terminated).toBe(true);
    expect(refused).toEqual(['a']);
    expect(done()).toEqual(['ambience']);
  });
});

describe('copies made at once', () => {
  it('are a few, never one per core', () => {
    expect([2, 4, 8, 14, 64].map((cores) => backgroundCopies(cores))).toEqual([1, 1, 2, 3, 3]);
  });

  it('fill the background slots, and a press starts beside them at once', async () => {
    const reads: string[] = [];
    const sounds = ['a', 'b', 'c', 'd'].map((id) => record(id));
    const { made } = copies(({ filePath }) => {
      reads.push(filePath);
      return filePath === sounds[3]!.filePath ? Promise.resolve(new ArrayBuffer(1)) : NEVER;
    }, undefined, 2);
    made.request(sounds.slice(0, 3));
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual([sounds[0]!.filePath, sounds[1]!.filePath]);
    made.request([sounds[3]!], true);
    await vi.advanceTimersByTimeAsync(0);
    expect(made.stateOf(sounds[3]!).state).toBe('ready');
    expect(made.stateOf(sounds[2]!).state).toBe('not-converted');
  });
});

describe('a waveform', () => {
  it('that gets nowhere is stopped, and one that gets somewhere is not', async () => {
    const stuck = readSoundPeaks(new Blob([]), 48000);
    const failure = expect(stuck).rejects.toMatchObject({ reason: 'unreadable' });
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS + 1);
    await failure;
    expect(FakeWorker.made[0]?.terminated).toBe(true);

    const going = readSoundPeaks(new Blob([]), 48000);
    const worker = FakeWorker.made[1];
    for (let at = 0; at < 3; at++) {
      await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS - 1000);
      worker?.say({ step: true });
    }
    worker?.say({ peaks: Uint8Array.of(1) });
    await expect(going).resolves.toEqual(Uint8Array.of(1));
  });
});
