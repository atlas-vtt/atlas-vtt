import { describe, expect, it } from 'vitest';
import { BufferRun, type RunDeps } from '@/app/sound/engine/soundRun';
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
