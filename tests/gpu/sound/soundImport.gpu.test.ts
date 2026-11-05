import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import plainMp3 from '../../fixtures/sound/sources/plain-44k.mp3?url';
import taggedMp3 from '../../fixtures/sound/sources/tagged-44k.mp3?url';
import flac from '../../fixtures/sound/sources/tone-48k.flac?url';
import vorbis from '../../fixtures/sound/sources/tone-48k.ogg?url';
import opus from '../../fixtures/sound/sources/tone-48k.opus?url';
import m4a from '../../fixtures/sound/sources/tone-44k.m4a?url';
import adts from '../../fixtures/sound/sources/tone-44k.aac?url';
import alac from '../../fixtures/sound/sources/refused-alac.m4a?url';
import ac3 from '../../fixtures/sound/sources/refused.ac3?url';
import { openOggOpus } from '@/app/sound/codec/oggOpusReader';
import { openSoundSource } from '@/app/sound/codec/demux/openSoundSource';
import { SoundImporter, type SoundImportResult } from '@/app/sound/codec/soundImporter';
import { memoryBytes, sineAt } from './soundHarness';

const FRAMES_2S = 96_000;

async function blobOf(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** Mono 16-bit WAV of a sine: `frames` of it, at `rate`, starting at phase 0, in as many pieces as `cycleFrames` allows. */
function waveBlob(rate: number, seconds: number, frequency: number, amplitude = 0.25, channels = 1): Blob {
  const frames = Math.round(seconds * rate);
  const bytes = new Uint8Array(44 + frames * 2 * channels);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => bytes.set(new TextEncoder().encode(value), at);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2 * channels, true);
  view.setUint16(32, 2 * channels, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2 * channels, true);
  for (let i = 0; i < frames; i++) {
    const value = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * frequency * i) / rate));
    for (let channel = 0; channel < channels; channel++) view.setInt16(44 + (i * channels + channel) * 2, value, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

async function decoded(result: SoundImportResult): Promise<Float32Array> {
  const context = new OfflineAudioContext(2, 48000, 48000);
  return (await context.decodeAudioData(await result.bytes.arrayBuffer())).getChannelData(0).slice();
}

/** How far a 440 Hz sine that starts at phase 0 lies from where it should: encoder and decoder delays both show here. */
function offsetFrames(samples: Float32Array): number {
  const { phase } = sineAt(samples, 24_000, 24_000, 440);
  return Math.abs((phase / (2 * Math.PI * 440)) * 48000);
}

describe('importing a sound', () => {
  let importer: SoundImporter;

  beforeAll(() => {
    importer = new SoundImporter();
  });

  afterAll(() => {
    importer.dispose();
  });

  it('turns a WAV into Ogg Opus of its exact length, at its place', async () => {
    const shares: number[] = [];
    const result = await importer.run({ source: waveBlob(48000, 2, 440), kind: 'music', loop: false }, (share) => shares.push(share));
    expect(result.frames).toBe(FRAMES_2S);
    expect(result.channels).toBe(1);
    const samples = await decoded(result);
    expect(samples.length).toBe(FRAMES_2S);
    console.log(`WAV 48 kHz: offset ${offsetFrames(samples).toFixed(2)} frames, ${result.lufs.toFixed(2)} LUFS, ${result.truePeakDb.toFixed(2)} dBTP, ${result.bytes.size} bytes`);
    expect(offsetFrames(samples)).toBeLessThan(1);
    expect(result.truePeakDb).toBeGreaterThan(-12.5);
    expect(result.truePeakDb).toBeLessThan(-11.5);
    expect(result.bytes.type).toBe('audio/ogg');
    expect(shares.length).toBeGreaterThan(0);
  });

  it('resamples a 44.1 kHz WAV to the length it has at 48 kHz', async () => {
    const result = await importer.run({ source: waveBlob(44100, 2, 440), kind: 'ambience', loop: false });
    expect(result.frames).toBe(FRAMES_2S);
    const samples = await decoded(result);
    expect(samples.length).toBe(FRAMES_2S);
    console.log(`WAV 44.1 kHz: offset ${offsetFrames(samples).toFixed(2)} frames`);
    expect(offsetFrames(samples)).toBeLessThan(1);
  });

  it('keeps stereo and encodes at the kind\'s bitrate', async () => {
    const music = await importer.run({ source: waveBlob(48000, 2, 440, 0.25, 2), kind: 'music', loop: false });
    const ambience = await importer.run({ source: waveBlob(48000, 2, 440, 0.25, 2), kind: 'ambience', loop: false });
    expect(music.channels).toBe(2);
    expect(ambience.bytes.size).toBeLessThan(music.bytes.size);
  });

  it.each([
    ['MP3 with a LAME tag', taggedMp3, FRAMES_2S, 1],
    ['FLAC', flac, FRAMES_2S, 1],
    ['Ogg Vorbis', vorbis, FRAMES_2S, 1],
    ['Ogg Opus', opus, FRAMES_2S, 1],
    ['AAC in M4A', m4a, FRAMES_2S, 1],
    ['AAC in ADTS', adts, null, null],
  ] as const)('reads %s', async (name, url, frames, tolerance) => {
    const source = await blobOf(url);
    let result: SoundImportResult;
    try {
      result = await importer.run({ source, kind: 'music', loop: false });
    } catch (error) {
      // Playwright's Chromium has no AAC, which only a real Chrome or Obsidian's Electron has.
      if (name.includes('AAC') && error instanceof Error && error.message.includes('cannot decode')) {
        console.log(`${name}: this browser has no such decoder`);
        return;
      }
      throw error;
    }
    const samples = await decoded(result);
    console.log(`${name}: ${result.frames} frames, offset ${offsetFrames(samples).toFixed(2)} frames, ${result.lufs.toFixed(2)} LUFS`);
    expect(samples.length).toBe(result.frames);
    if (frames !== null) expect(Math.abs(result.frames - frames)).toBeLessThanOrEqual(2);
    if (tolerance !== null) expect(offsetFrames(samples)).toBeLessThan(tolerance + 2);
    expect(sineAt(samples, 24_000, 24_000, 440).amplitude).toBeGreaterThan(0.05);
  });

  it('takes digital silence off both ends of a file marked as a loop', async () => {
    const frames = 48_000;
    const bytes = new Uint8Array(44 + frames * 2);
    const view = new DataView(bytes.buffer);
    bytes.set(await new Uint8Array(await waveBlob(48000, 1, 440).arrayBuffer()).slice(0, 44), 0);
    for (let i = 4800; i < frames - 9600; i++) view.setInt16(44 + i * 2, Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 48000)), true);
    const source = new Blob([bytes]);
    const kept = await importer.run({ source, kind: 'ambience', loop: false });
    const trimmed = await importer.run({ source, kind: 'ambience', loop: true });
    console.log(`loop trim: ${kept.frames} frames kept whole, ${trimmed.frames} once trimmed`);
    expect(kept.frames).toBe(frames);
    // A pure tone: losing a frame to the trim shows at the wrap, and a short crossfade lines it up again.
    expect(trimmed.frames).toBeLessThanOrEqual(frames - 4800 - 9600 + 2);
    expect(trimmed.frames).toBeGreaterThan(frames - 4800 - 9600 - 1500);
    expect((await decoded(trimmed)).length).toBe(trimmed.frames);
  });

  it('finds the ends of an MP3 without a tag, whose holes would sound on every loop', async () => {
    const result = await importer.run({ source: await blobOf(plainMp3), kind: 'ambience', loop: true });
    console.log(`MP3 without a tag, marked as a loop: ${result.frames} frames, ${result.seam}`);
    expect(result.frames).toBeLessThanOrEqual(FRAMES_2S + 96);
    expect(result.seam).toBeDefined();
  });

  it.each([
    ['ALAC', alac, 'unsupported-codec'],
    ['AC-3', ac3, 'unknown-format'],
  ])('refuses %s, saying why', async (_name, url, reason) => {
    await expect(importer.run({ source: await blobOf(url), kind: 'music', loop: false })).rejects.toMatchObject({ reason });
  });

  it('refuses what is no audio, and says so', async () => {
    await expect(importer.run({ source: new Blob(['just some text, not sound at all']), kind: 'music', loop: false })).rejects.toMatchObject({ reason: 'unknown-format' });
  });

  it('refuses a file with nothing in it', async () => {
    await expect(importer.run({ source: waveBlob(48000, 0, 440), kind: 'music', loop: false })).rejects.toMatchObject({ reason: 'empty' });
  });

  it('can be cancelled, and goes on with the next', async () => {
    const controller = new AbortController();
    const cancelled = importer.run({ source: waveBlob(48000, 60, 440), kind: 'music', loop: false }, undefined, undefined, controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const next = await importer.run({ source: waveBlob(48000, 1, 440), kind: 'music', loop: false });
    expect(next.frames).toBe(48000);
  });
});

/**
 * Size and speed on a long file, read from a URL under the worktree where one is named:
 * `VITE_SOUND_LONG_FILE=/.tmp/long.mp3`, else a generated WAV of `VITE_SOUND_LONG_MINUTES` (20).
 */
describe('a long file', () => {
  it('imports without decoding it whole, and comes out with a seek table', async () => {
    const env = import.meta.env as Record<string, string | undefined>;
    const minutes = Number(env.VITE_SOUND_LONG_MINUTES ?? 20);
    const url = env.VITE_SOUND_LONG_FILE;
    let source: Blob;
    if (url) {
      source = await blobOf(url);
    } else {
      // One second of whole cycles repeated: a blob out of pieces, as a real file's reads would be.
      const second = await waveBlob(48000, 1, 440).arrayBuffer();
      const body = second.slice(44);
      const head = new Uint8Array(second.slice(0, 44));
      const view = new DataView(head.buffer);
      const dataBytes = body.byteLength * minutes * 60;
      view.setUint32(4, dataBytes + 36, true);
      view.setUint32(40, dataBytes, true);
      source = new Blob([head, ...Array.from({ length: minutes * 60 }, () => body)]);
    }
    expect((await openSoundSource(source)).channels).toBeGreaterThan(0);
    const importer = new SoundImporter();
    const started = performance.now();
    let last = 0;
    const result = await importer.run({ source, kind: 'music', loop: false }, (share) => {
      last = share;
    });
    importer.dispose();
    const seconds = (performance.now() - started) / 1000;
    const audioSeconds = result.frames / 48000;
    console.log(`long import: source ${(source.size / 1e6).toFixed(0)} MB, ${(audioSeconds / 60).toFixed(1)} min, took ${seconds.toFixed(1)} s (${(audioSeconds / seconds).toFixed(0)} x real time), Opus ${(result.bytes.size / 1e6).toFixed(1)} MB, last progress ${last.toFixed(3)}`);
    const reader = memoryBytes(new Uint8Array(await result.bytes.slice(0, 256 * 1024).arrayBuffer()));
    const sound = await openOggOpus({ byteLength: result.bytes.size, read: reader.read });
    expect(sound.seek.length).toBeGreaterThan(audioSeconds / 6);
    if (!url) expect(result.frames).toBe(minutes * 60 * 48000);
  });
});
