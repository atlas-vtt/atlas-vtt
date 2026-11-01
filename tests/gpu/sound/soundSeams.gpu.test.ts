import { beforeAll, describe, expect, it } from 'vitest';
import { webCodecsWindowDecode, wholeFileWindowDecode, type WindowDecode } from '@/app/sound/engine/windowDecoder';
import type { SoundContext } from '@/app/sound/engine/audioNodes';
import { FIXTURE_FRAMES, largestStep, layerOf, loadFixtures, longestSilence, render, secondsToFrames, sineAt, tableOf, type Fixtures } from './soundHarness';

/** A 0.25 sine at 220 Hz. */
const NORMAL_STEP = 0.25 * Math.sin((2 * Math.PI * 220) / 48000);

/** What the plan calls a clean seam: no silent run over 1 frame, no step above twice normal. */
function expectClean(samples: Float32Array, from: number, to: number, label: string): void {
  const silence = longestSilence(samples, from, to);
  const step = largestStep(samples, from, to);
  const slip = largestSlip(samples, from, to);
  console.log(`seam ${label}: longest silence ${silence} frames, largest step ${step.toFixed(5)} (${(step / NORMAL_STEP).toFixed(2)} x normal), position within ${slip.toFixed(3)} frames`);
  expect(silence).toBeLessThanOrEqual(1);
  expect(step).toBeLessThanOrEqual(2 * NORMAL_STEP);
  expect(slip).toBeLessThan(0.5);
}

/**
 * Against the signal's own clock: every second of a sine of whole cycles has one phase if and only if no frame
 * was lost or added. A step cannot show this: at 220 Hz one lost frame is no more than twice the normal step.
 */
function largestSlip(samples: Float32Array, from: number, to: number): number {
  const reference = sineAt(samples, from, 48_000, 220).phase;
  let largest = 0;
  for (let at = from + 48_000; at + 48_000 <= to; at += 48_000) {
    const gap = Math.abs(sineAt(samples, at, 48_000, 220).phase - reference) % (2 * Math.PI);
    largest = Math.max(largest, ((gap > Math.PI ? 2 * Math.PI - gap : gap) / (2 * Math.PI * 220)) * 48000);
  }
  return largest;
}

describe('seams', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  it('decodes each file to its exact length', async () => {
    const context = new OfflineAudioContext(2, 48000, 48000);
    for (const [key, frames] of [['tone220', FIXTURE_FRAMES.short], ['long', FIXTURE_FRAMES.long]] as const) {
      const bytes = fixtures.files.get(key);
      if (!bytes) throw new Error('missing');
      const buffer = await context.decodeAudioData(bytes.slice().buffer);
      expect(buffer.length).toBe(frames);
    }
  });

  it('notices a single lost frame, or the rest of this file proves nothing', async () => {
    const whole = await render(tableOf({ layers: [layerOf(fixtures.tone220)] }), fixtures, { seconds: 4 });
    const lost = new Float32Array(whole.length - 1);
    lost.set(whole.subarray(0, 96_000));
    lost.set(whole.subarray(96_001), 96_000);
    expect(largestSlip(whole, secondsToFrames(0.5), whole.length)).toBeLessThan(0.5);
    expect(largestSlip(lost, secondsToFrames(0.5), lost.length)).toBeGreaterThan(0.9);
  });

  it('loops a short sound through its seam without a mark', async () => {
    const samples = await render(tableOf({ layers: [layerOf(fixtures.tone220)] }), fixtures, { seconds: 10 });
    expectClean(samples, secondsToFrames(0.5), samples.length, 'buffer loop, 3 wraps');
  });

  it('wraps a loop inside a short sound at its loop frames', async () => {
    // Whole cycles apart: 220 Hz over one second.
    const sound = { ...fixtures.tone220, loop: { startFrame: 24_000, endFrame: 72_000 } };
    const samples = await render(tableOf({ layers: [layerOf(sound)] }), fixtures, { seconds: 6 });
    expectClean(samples, secondsToFrames(0.5), samples.length, 'buffer loop on loop frames');
  });

  describe.each<[string, (context: SoundContext) => WindowDecode]>([
    ['AudioDecoder', webCodecsWindowDecode],
    ['whole-file windows', wholeFileWindowDecode],
  ])('long sounds through %s', (name, windowDecode) => {
    const supported = (): boolean => name !== 'AudioDecoder' || typeof AudioDecoder !== 'undefined';

    it('joins windows and wraps its end without a mark', async ({ skip }) => {
      if (!supported()) skip();
      // 44 s in: windows at 49, 54 and 59 s, the wrap at 61 s and more windows behind it.
      const samples = await render(tableOf({ layers: [layerOf(fixtures.long, { startAt: -44_000 })] }), fixtures, { seconds: 30, options: { windowDecode } });
      expectClean(samples, secondsToFrames(0.5), samples.length, `${name}, windows and wrap`);
    });

    it('wraps at loop frames, across windows', async ({ skip }) => {
      if (!supported()) skip();
      const sound = { ...fixtures.long, loop: { startFrame: 10 * 48000, endFrame: 22 * 48000 } };
      const samples = await render(tableOf({ layers: [layerOf(sound, { startAt: -18_000 })] }), fixtures, { seconds: 20, options: { windowDecode } });
      expectClean(samples, secondsToFrames(0.5), samples.length, `${name}, loop frames`);
    });
  });
});
