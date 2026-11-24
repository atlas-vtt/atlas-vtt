import { describe, expect, it } from 'vitest';
import { LoudnessMeter } from '@/app/sound/codec/loudness';
import { SOUND_RATE } from '@/app/sound/engine/soundMath';
import { ROOM_IDS, type RoomId, type SoundInfo, type TableSound } from '@/app/sound/soundTypes';
import { layerOf, musicOf, render, tableOf } from './soundHarness';

const SECONDS = 8;
/**
 * How far from dry a wet sound may come out, in dB. Rooms are evened out on a spectrum falling 6 dB an
 * octave; a sound brighter or darker than that comes out a little under or over (real tracks: -0.6 to
 * +0.8 dB, this mix: -1.1 to +0.5 dB).
 */
const TOLERANCE_DB = 1.25;
/** What is measured: the tail has built up by then. */
const FROM_SECONDS = 3;

/** A seeded noise source, so every run measures the very same sound. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296 - 0.5;
  };
}

/**
 * A mono 48 kHz WAV shaped like a busy mix: noise darkened above 300 Hz, under a chord whose partials fall
 * with their number, swelling and fading twice a second.
 */
function busyMix(): Uint8Array {
  const frames = SECONDS * SOUND_RATE;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => bytes.set(new TextEncoder().encode(value), at);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SOUND_RATE, true);
  view.setUint32(28, SOUND_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  const random = noise(7);
  const pole = Math.exp((-2 * Math.PI * 300) / SOUND_RATE);
  let dark = 0;
  for (let i = 0; i < frames; i++) {
    dark = pole * dark + (1 - pole) * random();
    let chord = 0;
    for (const [n, frequency] of [110, 165, 220, 277, 330, 440, 660, 880].entries()) chord += Math.sin((2 * Math.PI * frequency * i) / SOUND_RATE) / (n + 1);
    const swell = 0.6 + 0.4 * Math.sin((2 * Math.PI * 2 * i) / SOUND_RATE);
    view.setInt16(44 + i * 2, Math.round((1.2 * dark + 0.05 * chord * swell) * 32767), true);
  }
  return bytes;
}

const SOUND: SoundInfo = { key: 'mix', frames: SECONDS * SOUND_RATE, gainDb: 0 };
const files = new Map([['mix', busyMix()]]);

async function loudness(state: TableSound): Promise<number> {
  const samples = await render(state, { files }, { seconds: SECONDS });
  const meter = new LoudnessMeter(1);
  meter.add([samples.subarray(FROM_SECONDS * SOUND_RATE)]);
  return meter.result().lufs;
}

const inRoom = (room: RoomId, state: TableSound): TableSound => ({ ...state, room: { id: room, fade: { at: 0, ms: 0 } } });

/**
 * Turning a play's reverb knob makes it wetter, never louder: in every room, half and full reverb are
 * about as loud as the same sound dry, for a layer and for music alike. Before, a full knob in a cave
 * was almost 7 dB louder.
 */
describe('reverb keeps a sound as loud as it is dry', () => {
  it('in every room, at half and full', async () => {
    const dry = await loudness(tableOf({ layers: [layerOf(SOUND)] }));
    const off: string[] = [];
    for (const room of ROOM_IDS) {
      for (const reverb of [0.5, 1]) {
        const change = (await loudness(inRoom(room, tableOf({ layers: [layerOf(SOUND, { reverb })] })))) - dry;
        if (Math.abs(change) > TOLERANCE_DB) off.push(`${room} at ${reverb}: ${change.toFixed(2)} dB`);
      }
    }
    expect(off).toEqual([]);
  }, 120_000);

  it('for music too', async () => {
    const dry = await loudness(tableOf({ music: musicOf([SOUND]) }));
    const wet = await loudness(inRoom('cave', tableOf({ music: musicOf([SOUND], { reverb: 1 }) })));
    expect(Math.abs(wet - dry)).toBeLessThan(TOLERANCE_DB);
  }, 60_000);
});
