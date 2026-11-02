import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { SoundImporter, type SoundImportResult } from '@/app/sound/codec/soundImporter';
import { WHOLE_DECODE_FRAMES } from '@/app/sound/codec/seekTable';
import { webCodecsWindowDecode, wholeFileWindowDecode, type WindowDecode } from '@/app/sound/engine/windowDecoder';
import type { SoundContext } from '@/app/sound/engine/audioNodes';
import { SOUND_RATE } from '@/app/sound/engine/soundMath';
import { measurePlace, measureSpread, wrapFrameNear, type PlaceMeasure } from './loopMeasure';
import { layerOf, render, tableOf } from './soundHarness';

/**
 * Real encoders over noise-like and tonal signals of 2 s at 44.1 kHz, each a true loop unless named `cut` (a stretch
 * cut out of one at no particular place): `lame` 3.100 at 96 kbps, with `-t` for the `notag` ones, `afconvert`,
 * and ffmpeg's aac, libopus and vorbis. `rain` is high-passed noise with slow swells and drops, `drone` six partials
 * of whole cycles, `music` plucked notes wrapping around, `beat` a kick on frame 0. Periodic noise is made in the
 * frequency domain with random phases, so a wrap in the source is as continuous as any other place.
 */
const urls = import.meta.glob('../../fixtures/sound/loops/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const env = import.meta.env as Record<string, string | undefined>;
const reportFile = env.VITE_SOUND_LOOP_REPORT;

const SOURCE_FRAMES = 96_000;
/** Two seconds at 44.1 kHz, cut at 0.73 of the way. */
const CUT_FRAMES = Math.round(0.73 * 88_200 * (48_000 / 44_100));
/** What finding the ends in a file's level may miss by. */
const FOUND_ENDS_FRAMES = 150;

function urlOf(name: string): string {
  const entry = Object.entries(urls).find(([path]) => path.endsWith(`/${name}`));
  if (!entry) throw new Error(`no fixture ${name}`);
  return entry[1];
}

async function blobOf(name: string): Promise<Blob> {
  return (await fetch(urlOf(name))).blob();
}

/** A 16-bit stereo WAV. */
function waveOf(rate: number, left: Float32Array): Blob {
  const bytes = new Uint8Array(44 + left.length * 4);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => bytes.set(new TextEncoder().encode(value), at);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, left.length * 4, true);
  for (let i = 0; i < left.length; i++) {
    const value = Math.round((left[i] ?? 0) * 32767);
    view.setInt16(44 + i * 4, value, true);
    view.setInt16(46 + i * 4, value, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * Low noise under a tone, seeded. Where it wraps, its one-pole filter runs over the sound twice and the tone has whole
 * cycles, so it goes on across the wrap; where not, neither does, and it jumps.
 */
function bed(frames: number, cycles: number, wraps: boolean): Float32Array {
  let state = 1234;
  const noise = Float32Array.from({ length: frames }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  });
  let low = 0;
  const out = new Float32Array(frames);
  const allCycles = wraps ? cycles : cycles + 0.37;
  for (let pass = 0; pass < (wraps ? 2 : 1); pass++) {
    for (let i = 0; i < frames; i++) {
      low += 0.02 * ((noise[i] ?? 0) - low);
      out[i] = low * 0.3 + 0.1 * Math.sin((2 * Math.PI * allCycles * i) / frames);
    }
  }
  return out;
}

interface LoopReport {
  frames: number;
  wrap: PlaceMeasure;
  own: ReturnType<typeof measureSpread>;
}

async function rendered(result: SoundImportResult, options: { seconds?: number; windowDecode?: (context: SoundContext) => WindowDecode } = {}): Promise<LoopReport & { samples: Float32Array; wrapAt: number }> {
  const bytes = new Uint8Array(await result.bytes.arrayBuffer());
  const seconds = options.seconds ?? (2.6 * result.frames) / SOUND_RATE;
  const startAt = result.frames > WHOLE_DECODE_FRAMES ? -((result.frames / SOUND_RATE) * 1000 - 12_000) : 0;
  const samples = await render(tableOf({ layers: [layerOf({ key: 'sound', frames: result.frames, gainDb: 0 }, { startAt })] }), { files: new Map([['sound', bytes]]) }, { seconds, ...(options.windowDecode ? { options: { windowDecode: options.windowDecode } } : {}) });
  const decoded = (await new OfflineAudioContext(2, SOUND_RATE, SOUND_RATE).decodeAudioData(bytes.slice().buffer)).getChannelData(0);
  const expected = result.frames > WHOLE_DECODE_FRAMES ? 12 * SOUND_RATE : 2 * result.frames;
  const wrapAt = wrapFrameNear(samples, decoded, expected);
  const first = result.frames > WHOLE_DECODE_FRAMES ? 0 : wrapAt - result.frames;
  return { frames: result.frames, wrap: measurePlace(samples, wrapAt), own: measureSpread(samples, Math.min(result.frames, samples.length - first), first), samples, wrapAt };
}

const lines: string[] = [];

function report(name: string, result: SoundImportResult, loop: LoopReport): void {
  const { wrap, own } = loop;
  const fix = (value: number, digits = 2): string => value.toFixed(digits).padStart(7);
  lines.push(`${name.padEnd(30)} ${String(loop.frames).padStart(7)} ${(result.seam ?? '-').padEnd(10)} step ${fix(wrap.stepRatio)} (own ${fix(own.stepRatio)}) dip ${fix(wrap.dipDb, 1)} (own ${fix(own.dipDb, 1)}) click ${fix(wrap.clickDb, 1)} (own ${fix(own.clickDb, 1)}) hole ${wrap.hole}`);
}

/** Nothing to hear at the wrap that the sound does not do by itself. */
function expectUnheard(loop: LoopReport): void {
  expect(loop.wrap.hole).toBeLessThanOrEqual(2);
  expect(loop.wrap.stepRatio).toBeLessThanOrEqual(Math.max(2, 2 * loop.own.stepRatio));
  expect(loop.wrap.dipDb).toBeGreaterThan(loop.own.dipDb - 1.5);
  expect(loop.wrap.bumpDb).toBeLessThan(loop.own.bumpDb + 1.5);
}

describe('loops, on real encoders', () => {
  let importer: SoundImporter;

  beforeAll(() => {
    importer = new SoundImporter();
  });

  afterAll(async () => {
    importer.dispose();
    if (reportFile) await commands.writeFile(reportFile, `${lines.join('\n')}\n`);
  });

  /** Null where this browser has no such decoder: Playwright's Chromium has no AAC, Chrome and Obsidian do. */
  async function imported(name: string, loop = true): Promise<SoundImportResult | null> {
    try {
      return await importer.run({ source: await blobOf(name), kind: 'ambience', loop });
    } catch (error) {
      if (error instanceof Error && error.message.includes('cannot decode')) return null;
      throw error;
    }
  }

  it.each([
    // What says its ends: exactly its length.
    ['rain-loop.lame-tag.mp3', 'exact'],
    ['rain-loop.apple.m4a', 'exact'],
    ['rain-loop.ffmpeg.m4a', 'exact'],
    ['rain-loop.opus', 'exact'],
    // What says nothing: its ends are found.
    ['rain-loop.lame-notag.mp3', 'found'],
    ['rain-loop.lame-vbr-notag.mp3', 'found'],
    ['rain-loop.apple.aac', 'found'],
    ['music-loop.lame-notag.mp3', 'found'],
    ['music-loop.apple.aac', 'found'],
    ['beat-loop.lame-notag.mp3', 'found'],
    ['pink-cut.lame-notag.mp3', null],
  ] as const)('%s comes out at its length, and nothing shows at the wrap', async (name, ends) => {
    const result = await imported(name);
    if (!result) return;
    const loop = await rendered(result);
    report(name, result, loop);
    if (ends === 'exact') expect(result.seam).toBe('continuous');
    if (ends === 'exact') expect(result.frames).toBe(SOURCE_FRAMES);
    // Where it needed a crossfade at all, 10 ms and a place for a tone: what comes out of its length comes out of its rhythm.
    if (ends === 'found') expect(Math.abs(result.frames - SOURCE_FRAMES)).toBeLessThanOrEqual(result.seam === 'continuous' ? FOUND_ENDS_FRAMES : 480 + 960 + FOUND_ENDS_FRAMES);
    expectUnheard(loop);
  });

  it.each(['rain-loop.ffmpeg.aac', 'rain-loop.vorbis.ogg', 'rain-loop.lame-32k-notag.mp3'])('%s has no hole and no tail at the wrap', async (name) => {
    const result = await imported(name);
    if (!result) return;
    const loop = await rendered(result);
    report(name, result, loop);
    expectUnheard(loop);
  });

  it.each(['drone-loop.lame-notag.mp3', 'drone-loop.lame-tag.mp3', 'drone-loop.ffmpeg.aac', 'drone-cut.lame-notag.mp3', 'drone-cut.lame-tag.mp3'])('%s, a tone, gets a short crossfade lined up with itself', async (name) => {
    const result = await imported(name);
    if (!result) return;
    const loop = await rendered(result);
    report(name, result, loop);
    expect(result.seam).toBe('crossfaded');
    expectUnheard(loop);
    // Far less than it splattered untreated, which was around 50 dB.
    expect(loop.wrap.clickDb).toBeLessThan(40);
  });

  it('a lossless tone that already loops is left alone, at its exact length', async () => {
    const result = await imported('drone-loop.flac');
    if (!result) throw new Error('FLAC is in every browser');
    const loop = await rendered(result);
    report('drone-loop.flac', result, loop);
    expect(result.seam).toBe('continuous');
    expect(result.frames).toBe(SOURCE_FRAMES);
    expectUnheard(loop);
  });

  it.each([44_100, 48_000])('lossless noise and a tone at %i Hz stay exact where they already loop', async (rate) => {
    const result = await importer.run({ source: waveOf(rate, bed(2 * rate, 110, true)), kind: 'ambience', loop: true });
    const loop = await rendered(result);
    report(`wave ${rate}`, result, loop);
    expect(result.frames).toBe(SOURCE_FRAMES);
    expect(result.seam).toBe('continuous');
    expectUnheard(loop);
  });

  describe('the controls: what the measures prove', () => {
    it('a real hole of 31 ms and a real click are caught, in a signal that passes without them', async () => {
      const result = await imported('rain-loop.lame-tag.mp3');
      if (!result) throw new Error('MP3 is in every browser');
      const clean = await rendered(result);
      expectUnheard(clean);
      const holed = clean.samples.slice();
      holed.fill(0, clean.wrapAt - 744, clean.wrapAt + 744);
      const hole = measurePlace(holed, clean.wrapAt);
      expect(hole.hole).toBeGreaterThan(1000);
      expect(hole.dipDb).toBeLessThan(clean.own.dipDb - 10);
      const clicked = clean.samples.slice();
      clicked[clean.wrapAt] = (clicked[clean.wrapAt] ?? 0) + 1;
      expect(measurePlace(clicked, clean.wrapAt).stepRatio).toBeGreaterThan(2);
      expect(measurePlace(clicked, clean.wrapAt).clickDb).toBeGreaterThan(6);
    });

    it.each(['rain-loop.lame-notag.mp3', 'music-loop.lame-notag.mp3'])('%s not marked as a loop still has what marking takes away', async (name) => {
      const plain = await imported(name, false);
      if (!plain) throw new Error('MP3 is in every browser');
      expect(plain.seam).toBeUndefined();
      expect(plain.frames).toBeGreaterThan(SOURCE_FRAMES + 1000);
      const bare = await rendered(plain);
      report(`${name} unmarked`, plain, bare);
      expect(bare.wrap.dipDb).toBeLessThan(bare.own.dipDb);
    });
  });

  describe('a file not marked as a loop', () => {
    it('gets none of it: no end found, no crossfade, nothing rotated', async () => {
      const cut = await imported('drone-cut.lame-tag.mp3', false);
      expect(CUT_FRAMES).toBe(70_080);
      const plainWave = await importer.run({ source: waveOf(44_100, bed(CUT_FRAMES, 77, false)), kind: 'ambience', loop: false });
      expect(cut?.seam).toBeUndefined();
      expect(cut?.frames).toBe(CUT_FRAMES);
      expect(plainWave.seam).toBeUndefined();
      expect(plainWave.frames).toBe(Math.round((CUT_FRAMES * 48_000) / 44_100));
    });

    it('an Apple M4A keeps its priming as it always did, as only a loop reads what it says of it', async () => {
      const plain = await imported('rain-loop.apple.m4a', false);
      if (plain) expect(plain.frames).toBeGreaterThan(SOURCE_FRAMES);
    });
  });

  describe.each<[string, (context: SoundContext) => WindowDecode]>([
    ['AudioDecoder', webCodecsWindowDecode],
    ['whole-file windows', wholeFileWindowDecode],
  ])('over 60 s, through %s', (name, windowDecode) => {
    it.each([
      ['continuous', true],
      ['crossfaded', false],
    ] as const)('%s: its windows join and it wraps as a short sound does', async (seam, wraps) => {
      const frames = 62 * 44_100;
      const result = await importer.run({ source: waveOf(44_100, bed(frames, 62 * 110, wraps)), kind: 'ambience', loop: true });
      expect(result.seam).toBe(seam);
      expect(result.frames).toBeGreaterThan(WHOLE_DECODE_FRAMES);
      if (wraps) expect(result.frames).toBe(62 * SOUND_RATE);
      // 12 s to the wrap, with windows every 5 s on both sides of it.
      const loop = await rendered(result, { seconds: 24, windowDecode });
      report(`61 s ${seam}, ${name}`, result, loop);
      expect(loop.wrap.hole).toBeLessThanOrEqual(2);
      expect(loop.wrap.stepRatio).toBeLessThanOrEqual(2);
      expect(loop.wrap.dipDb).toBeGreaterThan(-3);
    });
  });
});
