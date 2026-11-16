import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BlobWindow } from '@/app/sound/codec/demux/blobWindow';
import type { EncodedSource } from '@/app/sound/codec/demux/demuxTypes';
import { demuxAdts } from '@/app/sound/codec/demux/adtsDemux';
import { demuxMp3 } from '@/app/sound/codec/demux/mp3Demux';
import { demuxMp4 } from '@/app/sound/codec/demux/mp4Demux';
import { LoopEnds, type LoopFinish } from '@/app/sound/codec/loopEnds';
import { crossfadeTailIntoHead, paddingAtEnd, seamState } from '@/app/sound/codec/loopSeam';
import { Resampler } from '@/app/sound/codec/pcmStages';

const REACH = 3344;
const LAME_END = 1203;
type Planes = Float32Array<ArrayBuffer>[];

/** Seeded, so a failure repeats. */
function noiseMaker(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  };
}

function noise(frames: number, level = 0.3, seed = 1): Float32Array<ArrayBuffer> {
  const next = noiseMaker(seed);
  return Float32Array.from({ length: frames }, () => next() * 2 * level);
}

function tone(frames: number, cyclesPerFrame: number, from = 0): Float32Array<ArrayBuffer> {
  return Float32Array.from({ length: frames }, (_, i) => 0.3 * Math.sin(2 * Math.PI * cyclesPerFrame * (from + i)));
}

/** What a decoder gives of a file without a tag: near silence that rises towards `end`, then the sound. */
function primed(sound: Float32Array<ArrayBuffer>, end: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(sound.length + end);
  const ramp = noise(end, 0.3, 2);
  for (let i = 0; i < end; i++) out[i] = (ramp[i] ?? 0) * 10 ** ((-60 + (40 * i) / end) / 20);
  out.set(sound, end);
  return out;
}

describe('padding at the ends of a file that does not say', () => {
  it('ends where a known encoder ends its priming', () => {
    expect(paddingAtEnd([primed(noise(48_000), LAME_END)], REACH, false, [LAME_END])).toBe(LAME_END);
  });

  it('finds the rise of an encoder it does not know, to about a millisecond', () => {
    const edge = paddingAtEnd([primed(noise(48_000), 1837)], REACH, false);
    expect(Math.abs(edge - 1837)).toBeLessThanOrEqual(48);
  });

  it('reads from the end alike', () => {
    const edge = paddingAtEnd([primed(noise(48_000), 620).reverse()], REACH, true);
    expect(Math.abs(edge - 620)).toBeLessThanOrEqual(48);
  });

  it('takes nothing of a sound that is sound from its first frame', () => {
    expect(paddingAtEnd([noise(48_000)], REACH, false, [LAME_END])).toBe(0);
    expect(paddingAtEnd([tone(48_000, 110 / 48_000)], REACH, false, [LAME_END])).toBe(0);
  });

  it('takes nothing of a fade, whatever its level', () => {
    const fade = noise(96_000);
    for (let i = 0; i < 48_000; i++) fade[i] = (fade[i] ?? 0) * (i / 48_000);
    expect(paddingAtEnd([fade], REACH, false, [LAME_END])).toBe(0);
  });
});

describe('whether a wrap is continuous', () => {
  const rate = 220 / 48_000;

  it('holds a tone that goes on across it as continuous', () => {
    const whole = tone(48_000, rate);
    expect(seamState([whole.slice(0, 8000)], [whole.slice(40_000)])).toBe('continuous');
  });

  it('holds noise as continuous, as a cut in it shows nowhere', () => {
    expect(seamState([noise(8000, 0.3, 3)], [noise(8000, 0.3, 4)])).toBe('continuous');
  });

  it('finds a tone that jumps, at any jump larger than its own', () => {
    expect(seamState([tone(8000, rate, 100)], [tone(8000, rate, 8000)])).toBe('click');
  });

  it('finds the ramp a codec leaves at the head', () => {
    const head = noise(8000);
    for (let i = 0; i < 480; i++) head[i] = (head[i] ?? 0) * 0.1;
    expect(seamState([head], [noise(8000, 0.3, 5)])).toBe('ramp');
  });

  it('leaves a head that begins on an attack as it is, whose splatter is its own', () => {
    const attack = Float32Array.from({ length: 8000 }, (_, i) => 0.8 * Math.exp(-i / 2000) * Math.sin(2 * Math.PI * i * rate));
    const decayed = Float32Array.from({ length: 8000 }, (_, i) => 0.01 * Math.sin(2 * Math.PI * i * rate));
    expect(seamState([attack], [decayed])).toBe('continuous');
  });
});

describe('the crossfade', () => {
  it('between noises keeps the power, over its whole length', () => {
    const head = [noise(8000, 0.3, 6)];
    const tail = [noise(8000, 0.3, 7)];
    const { planes } = crossfadeTailIntoHead(head, tail, 'ramp');
    expect(planes[0]?.length).toBe(1440);
    const power = (samples: Float32Array): number => samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
    const middle = planes[0]?.subarray(480, 960) ?? new Float32Array(0);
    expect(10 * Math.log10(power(middle) / power(head[0]?.subarray(0, 800) ?? new Float32Array(0)))).toBeGreaterThan(-1);
  });

  it('lines a tone up with itself, short, and keeps its sum', () => {
    const rate = 220 / 48_000;
    const head = [tone(8000, rate)];
    const tail = [tone(8000, rate, 1234)];
    const { planes, lag } = crossfadeTailIntoHead(head, tail, 'click');
    expect(planes[0]?.length).toBe(480);
    const start = 8000 - lag - 480;
    for (let i = 0; i < 480; i += 40) {
      const reading = planes[0]?.[i] ?? 0;
      expect(Math.abs(reading - (head[0]?.[i] ?? 0))).toBeLessThan(0.02);
      expect(Math.abs(reading - (tail[0]?.[start + i] ?? 0))).toBeLessThan(0.02);
    }
  });

  it('takes little of a loop for a click, without looking for a place that is not there', () => {
    const { planes, lag } = crossfadeTailIntoHead([noise(8000, 0.3, 10)], [noise(8000, 0.3, 11)], 'click');
    expect(planes[0]?.length).toBe(480);
    expect(lag).toBe(0);
  });

});

function run(sound: Float32Array<ArrayBuffer>, pieces: number, ends: LoopEnds): { written: Float32Array; finish: LoopFinish } {
  const out: number[] = [];
  const emit = (planes: Planes): void => out.push(...(planes[0] ?? []));
  const size = Math.ceil(sound.length / pieces);
  for (let at = 0; at < sound.length; at += size) ends.process([sound.slice(at, at + size)], emit);
  const finish = ends.finish(emit);
  return { written: Float32Array.from(out), finish };
}

describe('the ends of a sound marked as a loop', () => {
  it('holds nothing back in the end and changes no frame of a wrap that is continuous', () => {
    const whole = tone(144_000, 300 / 144_000);
    const { written, finish } = run(whole, 50, new LoopEnds(1, null, 0));
    expect(finish.seam).toBe('continuous');
    expect(written).toEqual(whole);
    expect(finish.skipFrames).toBe(1440);
    expect(finish.closing[0]).toEqual(whole.subarray(0, 1440));
    expect(finish.runOn[0]?.[0]).toBe(whole[1440]);
  });

  it('comes to the same however the file arrives', () => {
    const sound = primed(noise(96_000), LAME_END);
    const search = { reach: REACH, priming: [LAME_END] };
    const whole = run(sound, 1, new LoopEnds(1, search, 0));
    const pieces = run(sound, 80, new LoopEnds(1, search, 0));
    expect(pieces.written).toEqual(whole.written);
    expect(pieces.finish.skipFrames).toBe(whole.finish.skipFrames);
    expect(whole.written.length).toBe(96_000);
  });

  it('ends where the head goes on, after a crossfade', () => {
    const rate = 300 / 144_000;
    const cut = tone(100_000, rate);
    const { written, finish } = run(cut, 20, new LoopEnds(1, null, 0));
    expect(finish.seam).toBe('crossfaded');
    const closing = finish.closing[0] ?? new Float32Array(0);
    const last = closing.at(-1) ?? 0;
    const next = finish.runOn[0]?.[0] ?? 0;
    expect(Math.abs(next - last)).toBeLessThan(0.02);
    expect(written.length + closing.length - finish.skipFrames).toBeLessThan(100_000);
  });

  it('keeps a sound too short to join whole', () => {
    const short = noise(3000);
    const { written, finish } = run(short, 3, new LoopEnds(1, { reach: REACH, priming: [LAME_END] }, 0));
    expect(finish.seam).toBe('continuous');
    expect(written.length).toBe(3000);
  });
});

describe('resampling a sound that wraps', () => {
  it('gives its first frames again past the end, as if it went on', () => {
    const rate = 44_100;
    const cycles = 110 * 2;
    const input = Float32Array.from({ length: 2 * rate }, (_, i) => 0.3 * Math.sin((2 * Math.PI * cycles * i) / (2 * rate)));
    const resampler = new Resampler(rate, 1, true);
    const out: number[] = [...(resampler.process([input])[0] ?? [])];
    out.push(...(resampler.flush()[0] ?? []));
    const length = 96_000;
    expect(out.length).toBe(length + resampler.wrapFrames);
    for (let i = 0; i < resampler.wrapFrames; i++) {
      const expected = 0.3 * Math.sin((2 * Math.PI * 110 * i) / 48_000);
      expect(Math.abs((out[length + i] ?? 0) - expected)).toBeLessThan(0.001);
    }
  });

  it('otherwise stays exactly as it was', () => {
    const input = noise(44_100);
    const plain = new Resampler(44_100, 1);
    const out = [...(plain.process([input])[0] ?? []), ...(plain.flush()[0] ?? [])];
    expect(out.length).toBe(48_000);
    expect(plain.wrapFrames).toBe(0);
  });
});

describe('what a file says of its ends', () => {
  const windowOf = (name: string): BlobWindow => new BlobWindow(new Blob([readFileSync(`tests/fixtures/sound/loops/${name}`)]));

  it('reads an Apple M4A for a loop only: a plain sound stays as it was', async () => {
    const source: EncodedSource = await demuxMp4(windowOf('rain-loop.apple.m4a'));
    expect(source.loopEnds).toEqual({ skipFrames: 2112, totalFrames: 88_200 });
    expect(source.skipFrames).toBe(0);
    expect(source.totalFrames).toBeNull();
    expect(source.primingHints).toBeUndefined();
  });

  it('takes an edit list as saying it too', async () => {
    const source = await demuxMp4(windowOf('rain-loop.ffmpeg.m4a'));
    expect(source.skipFrames).toBe(1024);
    expect(source.primingHints).toBeUndefined();
  });

  it('looks for the padding of what says nothing', async () => {
    expect((await demuxMp3(windowOf('rain-loop.lame-notag.mp3'))).primingHints).toEqual([1105]);
    expect((await demuxAdts(windowOf('rain-loop.apple.aac'))).primingHints).toEqual([2112, 1024]);
  });

  it('believes a LAME tag', async () => {
    const source = await demuxMp3(windowOf('rain-loop.lame-tag.mp3'));
    expect(source.primingHints).toBeUndefined();
    expect(source.totalFrames).toBe(88_200);
  });
});
