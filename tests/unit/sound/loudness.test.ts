import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LoudnessMeter } from '@/app/sound/codec/loudness';
import { soundGainDb, soundInfoOf } from '@/app/sound/codec/soundInfo';

const RATE = 48000;

type Signal = (time: number, channel: number, random: () => number) => number;

function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296 * 2 - 1;
  };
}

function render(signal: Signal, seconds: number, channels: number): Float32Array[] {
  const frames = Math.round(seconds * RATE);
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  const random = randomFrom(99);
  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < channels; channel++) (planes[channel] as Float32Array)[i] = signal(i / RATE, channel, random);
  }
  return planes;
}

function measure(planes: Float32Array[], piece = 4800): ReturnType<LoudnessMeter['result']> {
  const meter = new LoudnessMeter(planes.length);
  const frames = planes[0]?.length ?? 0;
  for (let start = 0; start < frames; start += piece) meter.add(planes.map((plane) => plane.subarray(start, start + piece)));
  return meter.result();
}

function wave(planes: Float32Array[]): Uint8Array {
  const frames = planes[0]?.length ?? 0;
  const channels = planes.length;
  const bytes = new Uint8Array(44 + frames * channels * 4);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => bytes.set(new TextEncoder().encode(value), at);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 4, true);
  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < channels; channel++) view.setFloat32(44 + (i * channels + channel) * 4, planes[channel]?.[i] ?? 0, true);
  }
  return bytes;
}

const SIGNALS: Array<{ name: string; channels: number; seconds: number; signal: Signal }> = [
  { name: 'a sine at -23 dBFS, 1 kHz', channels: 2, seconds: 10, signal: (t) => 10 ** (-23 / 20) * Math.sin(2 * Math.PI * 1000 * t) },
  { name: 'loud low sine', channels: 2, seconds: 8, signal: (t) => 0.7 * Math.sin(2 * Math.PI * 80 * t) },
  { name: 'noise, different per channel', channels: 2, seconds: 12, signal: (_t, _c, random) => 0.2 * random() },
  { name: 'quiet noise, mono', channels: 1, seconds: 10, signal: (_t, _c, random) => 0.02 * random() },
  { name: 'a tone that comes and goes, for the gates', channels: 2, seconds: 30, signal: (t) => (Math.floor(t / 3) % 2 === 0 ? 0.5 : 0.002) * Math.sin(2 * Math.PI * 440 * t) },
  { name: 'high sine at a quarter of the rate, peaks between samples', channels: 2, seconds: 6, signal: (t) => 0.9 * Math.sin(2 * Math.PI * 11_025 * t + 0.7) },
  { name: 'square-like, loud', channels: 2, seconds: 6, signal: (t) => 0.95 * Math.sign(Math.sin(2 * Math.PI * 997 * t)) },
];

describe('loudness', () => {
  it('reads a stereo 1 kHz sine at -23 dBFS peak as about -23 LUFS, as the standard says', () => {
    const { lufs } = measure(render((t) => 10 ** (-23 / 20) * Math.sin(2 * Math.PI * 1000 * t), 10, 2));
    expect(lufs).toBeGreaterThan(-23.1);
    expect(lufs).toBeLessThan(-22.8);
  });

  it('does not depend on how the audio is cut into pieces', () => {
    const planes = render((t, c, random) => 0.3 * Math.sin(2 * Math.PI * 300 * t + c) + 0.05 * random(), 5, 2);
    const whole = measure(planes, 1 << 30);
    const small = measure(planes, 777);
    expect(small.lufs).toBeCloseTo(whole.lufs, 5);
    expect(small.truePeakDb).toBeCloseTo(whole.truePeakDb, 3);
  });

  it('has no loudness for silence or a sound too short for a block', () => {
    expect(measure(render(() => 0, 2, 2))).toEqual({ lufs: -Infinity, truePeakDb: -Infinity });
    const short = measure(render((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 0.2, 2));
    expect(short.lufs).toBe(-Infinity);
    expect(short.truePeakDb).toBeGreaterThan(-6.5);
  });
});

describe('the gain of a sound', () => {
  it('takes the target where the peak allows', () => {
    expect(soundGainDb(-14, -3)).toBe(-6);
    expect(soundGainDb(-26, -10)).toBe(6);
  });

  it('stops at the ceiling', () => {
    expect(soundGainDb(-26, -3)).toBe(2);
  });

  it('adds the trim on top', () => {
    expect(soundGainDb(-14, -3, -2.5)).toBe(-8.5);
  });

  it('goes by the peak where no loudness was measured, and leaves silence alone', () => {
    expect(soundGainDb(-Infinity, -6)).toBe(5);
    expect(soundGainDb(-Infinity, -Infinity)).toBe(0);
    expect(soundGainDb(-Infinity, -Infinity, 3)).toBe(3);
  });

  it('makes a SoundInfo', () => {
    const loop = { startFrame: 10, endFrame: 20 };
    expect(soundInfoOf('k', { frames: 30, lufs: -20, truePeakDb: -6 }, { trimDb: 1, loop })).toEqual({ key: 'k', frames: 30, gainDb: 1, loop });
    expect(soundInfoOf('k', { frames: 30, lufs: -20, truePeakDb: -6 })).toEqual({ key: 'k', frames: 30, gainDb: 0 });
  });
});

const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.runIf(ffmpeg)('loudness against ffmpeg ebur128', () => {
  const dir = ffmpeg ? mkdtempSync(join(tmpdir(), 'atlas-loudness-')) : '';

  function ebur128(planes: Float32Array[], name: string): { lufs: number; peak: number } {
    const file = join(dir, `${name}.wav`);
    writeFileSync(file, wave(planes));
    const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']).stderr.toString();
    rmSync(file);
    const lufs = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(out)?.[1];
    const peak = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(out)?.[1];
    return { lufs: Number(lufs), peak: Number(peak) };
  }

  it.each(SIGNALS)('$name', ({ name, signal, seconds, channels }) => {
    const planes = render(signal, seconds, channels);
    const ours = measure(planes);
    const theirs = ebur128(planes, name.replace(/\W+/g, '-'));
    console.log(`loudness ${name}: ours ${ours.lufs.toFixed(2)} LUFS ${ours.truePeakDb.toFixed(2)} dBTP, ffmpeg ${theirs.lufs} LUFS ${theirs.peak} dBTP`);
    expect(Math.abs(ours.lufs - theirs.lufs)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(ours.truePeakDb - theirs.peak)).toBeLessThanOrEqual(0.5);
  }, 30_000);

  it('cleans up', () => {
    rmSync(dir, { recursive: true });
    expect(execFileSync('ffmpeg', ['-version']).length).toBeGreaterThan(0);
  });
});
