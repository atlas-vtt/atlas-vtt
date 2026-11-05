import { describe, expect, it } from 'vitest';
import { BufferRun, FIRST_JOIN_LEAD_SECONDS, FIRST_WINDOW_FRAMES, WindowRun, type RunDeps } from '@/app/sound/engine/soundRun';
import { SoundSources } from '@/app/sound/engine/soundSources';
import type { TimelineSpan } from '@/app/sound/engine/soundTimeline';
import { FakeSoundContext } from '../../helpers/fakeSoundContext';
import { emptyBytes, RATE, sound } from '../../helpers/soundPlayerRig';

function rig(): { context: FakeSoundContext; sources: SoundSources; deps: RunDeps } {
  const context = new FakeSoundContext();
  // Nothing spare is kept, so a buffer goes as soon as no run holds it.
  const sources = new SoundSources(context, () => emptyBytes, null, 0);
  return { context, sources, deps: { context, sources, output: context.createGain(), onError: () => undefined } };
}

const span = (end: number | null): TimelineSpan => ({ sound: sound('a', 10), startPlayFrame: 0, endPlayFrame: end, loop: null });

describe('a run with no source', () => {
  it('holds a buffer once, however many ticks pass, where the place it could start in lies past its end', async () => {
    const { context, sources, deps } = rig();
    // A soft restart: the track ends 100 ms before the replacement may sound.
    const run = new BufferRun(deps, span(RATE), 0, RATE + RATE / 10, 1);
    run.pump();
    await sources.settled();
    expect(sources.decodedBytes()).toBeGreaterThan(0);
    for (let tick = 0; tick < 10; tick++) run.pump();
    await sources.settled();
    expect(context.sources).toHaveLength(0);
    expect(run.waiting).toBe(false);
    run.dispose();
    expect(sources.decodedBytes()).toBe(0);
  });

  it('holds a buffer once where it was told to finish before the decode arrived', async () => {
    const { context, sources, deps } = rig();
    const run = new BufferRun(deps, span(null), 0, 0, 1);
    run.pump();
    run.finishAt(RATE, 0.04);
    await sources.settled();
    for (let tick = 0; tick < 10; tick++) run.pump();
    await sources.settled();
    expect(context.sources).toHaveLength(0);
    run.dispose();
    expect(sources.decodedBytes()).toBe(0);
  });

  it('never asks for a buffer once it was told to finish', async () => {
    const { context, sources, deps } = rig();
    const run = new BufferRun(deps, span(null), 0, 0, 1);
    run.finishAt(RATE, 0.04);
    run.pump();
    await sources.settled();
    expect(context.decodeCalls).toBe(0);
    run.dispose();
  });

  it('asks again after a failure, and still lets go once', async () => {
    const { context, sources, deps } = rig();
    const decode = context.decodeAudioData.bind(context);
    let fails = 1;
    context.decodeAudioData = (): ReturnType<typeof decode> => (fails-- > 0 ? Promise.reject(new Error('no')) : decode());
    const run = new BufferRun(deps, span(null), 0, 0, 1);
    run.pump();
    await sources.settled();
    expect(context.sources).toHaveLength(0);
    context.currentTime += 6;
    run.pump();
    await sources.settled();
    expect(context.sources).toHaveLength(1);
    run.dispose();
    expect(sources.decodedBytes()).toBe(0);
  });
});

describe('a long sound that starts late', () => {
  /** Windows that come at once, as fast as a decode can be; the run aims where it aims and nothing else. */
  function windowRig(): { context: FakeSoundContext; run: WindowRun; asked: number[] } {
    const context = new FakeSoundContext();
    const asked: number[] = [];
    const sources = { decodeWindow: (_key: string, frame: number, count: number) => { asked.push(frame); return Promise.resolve(context.createBuffer(2, count, RATE)); } } as unknown as SoundSources;
    const long: TimelineSpan = { sound: sound('long', 300), startPlayFrame: 0, endPlayFrame: null, loop: null };
    // The table said "now" a second ago (a state that took its time to arrive): the start is late.
    context.currentTime = 1;
    const run = new WindowRun({ context, sources, output: context.createGain(), onError: () => undefined }, long, 0, 0, 1);
    return { context, run, asked };
  }

  it('aims its first window just past now, not a decode\'s time later', async () => {
    const { context, run, asked } = windowRig();
    run.pump();
    await Promise.resolve();
    await Promise.resolve();
    const first = context.sources[0]?.started;
    expect(FIRST_JOIN_LEAD_SECONDS).toBe(0.02);
    expect(first?.when).toBeCloseTo(1 + FIRST_JOIN_LEAD_SECONDS, 3);
    expect(Math.abs((asked[0] ?? 0) - (1 + FIRST_JOIN_LEAD_SECONDS) * RATE)).toBeLessThanOrEqual(1);
    run.dispose();
  });

  it('keeps the longer lead once it sounds, so later windows still land on their frames', async () => {
    const { context, run, asked } = windowRig();
    run.pump();
    await Promise.resolve();
    await Promise.resolve();
    // The page stalled past the next window's place: it rejoins a decode's time ahead.
    context.currentTime = 20;
    run.pump();
    expect(Math.abs((asked[1] ?? 0) - (20 + 0.15) * RATE)).toBeLessThanOrEqual(1);
    run.dispose();
  });
});

describe('a long sound\'s first window', () => {
  it('is short, so a press waits for a short decode, and the windows after it are whole', async () => {
    const context = new FakeSoundContext();
    const counts: number[] = [];
    const sources = { decodeWindow: (_key: string, _frame: number, count: number) => { counts.push(count); return Promise.resolve(context.createBuffer(2, count, RATE)); } } as unknown as SoundSources;
    const run = new WindowRun({ context, sources, output: context.createGain(), onError: () => undefined }, { sound: sound('long', 300), startPlayFrame: 0, endPlayFrame: null, loop: null }, 0, 0, 1);
    run.pump();
    await Promise.resolve();
    await Promise.resolve();
    run.pump();
    await Promise.resolve();
    await Promise.resolve();
    expect(FIRST_WINDOW_FRAMES).toBe(2 * RATE);
    expect(counts).toEqual([FIRST_WINDOW_FRAMES, 5 * RATE]);
    // The second window follows the first on its exact frame.
    expect(context.sources[1]?.started?.when).toBeCloseTo((context.sources[0]?.started?.when ?? 0) + FIRST_WINDOW_FRAMES / RATE, 6);
    run.dispose();
  });
});
