// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundImporter, type SoundImportJob } from '@/app/sound/codec/soundImporter';
import type { SoundImportMessage } from '@/app/sound/codec/soundImportProtocol';

class FakeWorker {
  static made: FakeWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<SoundImportMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(): void { /* The conversion is whatever a test says it is. */ }
  terminate(): void { this.terminated = true; }
  say(message: SoundImportMessage): void { this.onmessage?.({ data: message } as MessageEvent<SoundImportMessage>); }
}

vi.mock('@/app/sound/codec/soundImportWorker?worker&inline', () => ({ default: class { constructor() { return new FakeWorker(); } } }));

const JOB: SoundImportJob = { source: new Blob(['x']), kind: 'music', loop: false };
const MINUTE = 60_000;

describe('a conversion', () => {
  beforeEach(() => {
    FakeWorker.made = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('that gets nowhere is stopped and refused, and holds up no other sound', async () => {
    const importer = new SoundImporter();
    const stuck = importer.run(JOB);
    const failure = expect(stuck).rejects.toMatchObject({ reason: 'unreadable' });
    const next = importer.run(JOB);
    await vi.advanceTimersByTimeAsync(0);
    // Each runs in its own worker at once: how many at a time is the queue's to say.
    expect(FakeWorker.made).toHaveLength(2);
    const result = { bytes: new Blob(), frames: 1, channels: 1, lufs: 0, truePeakDb: 0 };
    FakeWorker.made[1]?.say({ type: 'done', result });
    await expect(next).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    await failure;
    expect(FakeWorker.made[0]?.terminated).toBe(true);
    importer.dispose();
  });

  it('is left alone for as long as it takes steps, however long that is', async () => {
    const importer = new SoundImporter();
    const seen: number[] = [];
    const done = importer.run(JOB, (share) => seen.push(share));
    await vi.advanceTimersByTimeAsync(0);
    for (let step = 1; step <= 10; step++) {
      await vi.advanceTimersByTimeAsync(MINUTE);
      FakeWorker.made[0]?.say({ type: 'progress', share: step / 100 });
    }
    expect(FakeWorker.made[0]?.terminated).toBe(false);
    expect(seen).toHaveLength(10);
    const result = { bytes: new Blob(), frames: 1, channels: 1, lufs: 0, truePeakDb: 0 };
    FakeWorker.made[0]?.say({ type: 'done', result });
    await expect(done).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('that fails ends its watch', async () => {
    const importer = new SoundImporter();
    const done = importer.run(JOB);
    await vi.advanceTimersByTimeAsync(0);
    FakeWorker.made[0]?.say({ type: 'failed', reason: 'empty', detail: 'nothing' });
    await expect(done).rejects.toMatchObject({ reason: 'empty' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('running when the importer is disposed stops, is told so, and leaves no timer', async () => {
    const importer = new SoundImporter();
    const running = importer.run(JOB);
    const told = expect(running).rejects.toMatchObject({ reason: 'unreadable' });
    await vi.advanceTimersByTimeAsync(0);
    importer.dispose();
    await told;
    expect(FakeWorker.made[0]?.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
