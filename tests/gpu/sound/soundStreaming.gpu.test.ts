import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { GrowingCopy } from '@/app/sound/codec/growingCopy';
import { openOggOpus } from '@/app/sound/codec/oggOpusReader';
import { SoundImporter } from '@/app/sound/codec/soundImporter';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { STREAM_START_FRAMES } from '@/app/soundDirector/growingCopies';
import { memoryBytes, musicOf, render, tableOf } from './soundHarness';

const SECONDS = 180;

/** A stereo 44.1 kHz WAV: a tone over a quieter, slower one, so every window differs from the next. */
function wave(seconds: number): Blob {
  const rate = 44_100;
  const frames = seconds * rate;
  const bytes = new Uint8Array(44 + frames * 4);
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
  view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) {
    const value = 0.2 * Math.sin((2 * Math.PI * 330 * i) / rate) + 0.1 * Math.sin((2 * Math.PI * 0.5 * i) / rate) * Math.sin((2 * Math.PI * 97 * i) / rate);
    view.setInt16(44 + i * 4, Math.round(value * 32767), true);
    view.setInt16(46 + i * 4, Math.round(value * 30000), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * A copy played while it is made: the real worker streams its pages, playing can begin long before the copy
 * is whole, and what plays from the growing pages is the stored copy's own stream, sample for sample.
 */
describe('a copy that plays while it is made', () => {
  it('can play within a fraction of its making, and is the stored copy\'s very stream', async () => {
    const importer = new SoundImporter();
    let growing: GrowingCopy | null = null;
    let playableAt = 0;
    const started = performance.now();
    const result = await importer.run({ source: wave(SECONDS), kind: 'music', loop: false, stream: true }, undefined, {
      start: (start) => { growing = new GrowingCopy(start); },
      pages: (pages) => {
        growing?.add(pages);
        if (playableAt === 0 && growing && growing.frames >= STREAM_START_FRAMES && Number.isFinite(growing.lufs)) playableAt = performance.now() - started;
      },
    });
    const total = performance.now() - started;
    importer.dispose();
    const copy = growing as GrowingCopy | null;
    if (!copy) throw new Error('No pages came.');
    copy.end();
    await commands.writeFile('tests/gpu/sound/__screenshots__/sound-streaming/measures.txt', `${SECONDS} s at 44.1 kHz: playable after ${playableAt.toFixed(0)} ms, whole after ${total.toFixed(0)} ms\n`);
    expect(playableAt).toBeGreaterThan(0);
    expect(playableAt).toBeLessThan(total / 2);
    expect(Math.abs(copy.estimatedFrames - SECONDS * 48_000)).toBeLessThan(48_000);

    const stored = new Uint8Array(await result.bytes.arrayBuffer());
    const header = await openOggOpus(memoryBytes(stored));
    expect(new Uint8Array(await copy.read(0, copy.byteLength))).toEqual(stored.subarray(header.audioStart));
    expect(copy.preSkip).toBe(header.preSkip);

    const playing = (info: Omit<SoundInfo, 'key'>) => tableOf({ music: musicOf([{ key: 'g', ...info }], { startAt: 0 }) });
    const fromGrowing = await render(playing({ frames: result.frames, gainDb: 0, growing: true }), { files: new Map() }, { seconds: 4, options: { resolve: () => copy } });
    const fromStored = await render(playing({ frames: result.frames, gainDb: 0 }), { files: new Map([['g', stored]]) }, { seconds: 4 });
    let largest = 0;
    for (let i = 0; i < fromStored.length; i++) largest = Math.max(largest, Math.abs((fromGrowing[i] ?? 0) - (fromStored[i] ?? 0)));
    expect(largest).toBeLessThan(1e-6);
    expect(Math.max(...fromStored.subarray(48_000, 96_000).map(Math.abs))).toBeGreaterThan(0.05);
  }, 120_000);
});
