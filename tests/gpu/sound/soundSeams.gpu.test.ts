import { beforeAll, describe, expect, it } from 'vitest';
import { webCodecsWindowDecode, wholeFileWindowDecode, type WindowDecode } from '@/app/sound/engine/windowDecoder';
import type { SoundContext } from '@/app/sound/engine/audioNodes';
import crossfadedDrone from '../../fixtures/sound/loops/converted/drone-crossfaded.ogg?url';
import foundRain from '../../fixtures/sound/loops/converted/rain-found-ends.ogg?url';
import { OggOpusWriter } from '@/app/sound/codec/oggOpusWriter';
import { packetsOfPage, readPage } from '@/app/sound/codec/oggPages';
import { FIXTURE_FRAMES, largestStep, layerOf, loadFixtures, longestSilence, render, secondsToFrames, sineAt, tableOf, type Fixtures } from './soundHarness';
import { measurePlace, measureSpread, wrapFrameNear } from './loopMeasure';

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

/** The file's own packets with `skipFrames` more of them under the pre-skip, as an import that crossfaded writes. */
function withLongerPreSkip(bytes: Uint8Array, frames: number, skipFrames: number): Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>> {
  const headPage = readPage(bytes, 0);
  const head = headPage && packetsOfPage(headPage, null).packets[0];
  if (!headPage || !head) throw new Error('no head');
  const writer = new OggOpusWriter(head);
  let page = readPage(bytes, headPage.end);
  let audio = false;
  while (page) {
    if (audio) for (const packet of packetsOfPage(page, null).packets) writer.addPacket(packet);
    audio = true;
    page = readPage(bytes, page.end);
  }
  return writer.finish(frames, skipFrames).arrayBuffer().then((buffer) => new Uint8Array(buffer));
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

  describe('what an import of a marked loop writes', () => {
    it.each([
      ['rain whose ends were found', foundRain],
      ['a drone crossfaded into itself', crossfadedDrone],
    ])('%s wraps with nothing to hear, on this engine', async (name, url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const decoded = (await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(bytes.slice().buffer)).getChannelData(0);
      const frames = decoded.length;
      const samples = await render(tableOf({ layers: [layerOf({ key: 'sound', frames, gainDb: 0 })] }), { files: new Map([['sound', bytes]]) }, { seconds: (2.6 * frames) / 48000 });
      const wrapAt = wrapFrameNear(samples, decoded, 2 * frames);
      const wrap = measurePlace(samples, wrapAt);
      const own = measureSpread(samples, frames, wrapAt - frames);
      console.log(`${name}: ${frames} frames, step ${wrap.stepRatio.toFixed(2)} (own ${own.stepRatio.toFixed(2)}), dip ${wrap.dipDb.toFixed(1)} (own ${own.dipDb.toFixed(1)}), click ${wrap.clickDb.toFixed(1)} (own ${own.clickDb.toFixed(1)}), hole ${wrap.hole}`);
      expect(wrap.hole).toBeLessThanOrEqual(2);
      expect(wrap.stepRatio).toBeLessThanOrEqual(2);
      expect(wrap.dipDb).toBeGreaterThan(own.dipDb - 1.5);
    });

    it('a long pre-skip and a stream that runs on past its end keep the length exact, whole', async () => {
      const bytes = fixtures.files.get('tone220');
      if (!bytes) throw new Error('missing');
      const short = await withLongerPreSkip(bytes, 2 * 48_000, 48_000);
      const files = new Map([['short', short]]);
      const context = new OfflineAudioContext(2, 48000, 48000);
      expect((await context.decodeAudioData(short.slice().buffer)).length).toBe(2 * 48_000);
      const samples = await render(tableOf({ layers: [layerOf({ key: 'short', frames: 2 * 48_000, gainDb: 0 })] }), { files }, { seconds: 8 });
      expectClean(samples, secondsToFrames(0.5), samples.length, 'a second under the pre-skip, buffer loop');
    });

    describe.each<[string, (context: SoundContext) => WindowDecode]>([
      ['AudioDecoder', webCodecsWindowDecode],
      ['whole-file windows', wholeFileWindowDecode],
    ])('through %s', (name, windowDecode) => {
      it('a long pre-skip over 60 s joins its windows and wraps', async ({ skip }) => {
        if (name === 'AudioDecoder' && typeof AudioDecoder === 'undefined') skip();
        const bytes = fixtures.files.get('long');
        if (!bytes) throw new Error('missing');
        // A second under the pre-skip, and no whole-decode limit in reach: 60 s of whole cycles, plus what runs on.
        const frames = 60 * 48_000 + 1;
        const long = await withLongerPreSkip(bytes, frames - 1 + 48_000 * 0, 48_000);
        const files = new Map([['long2', long]]);
        const sound = { key: 'long2', frames: frames - 1, gainDb: 0, loop: { startFrame: 0, endFrame: frames - 1 } };
        const samples = await render(tableOf({ layers: [layerOf({ ...sound }, { startAt: -44_000 })] }), { files }, { seconds: 24, options: { windowDecode } });
        expectClean(samples, secondsToFrames(0.5), samples.length, `${name}, a second under the pre-skip`);
      });
    });
  });
});
