import tone220Long from '../../fixtures/sound/tone220-61s.ogg?url';
import tone220 from '../../fixtures/sound/tone220-3s.ogg?url';
import tone330 from '../../fixtures/sound/tone330-3s.ogg?url';
import { packetsOfPage, readPage } from '@/app/sound/codec/oggPages';
import { OggOpusWriter } from '@/app/sound/codec/oggOpusWriter';
import { SOUND_RATE } from '@/app/sound/engine/soundMath';
import { SoundPlayer, type SoundPlayerOptions } from '@/app/sound/engine/soundPlayer';
import type { LayerPlay, MusicPlay, SoundBytes, SoundInfo, TableSound } from '@/app/sound/soundTypes';

/** Libopus files of whole cycles of a 0.25 sine, 220 or 330 Hz, so a perfect loop exists. */
export const FIXTURE_FRAMES = { short: 3 * SOUND_RATE, long: 61 * SOUND_RATE };

async function fetched(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** Our own writer over the file's own packets, which adds the seek table a long file has. */
async function rewritten(bytes: Uint8Array, frames: number): Promise<Uint8Array> {
  const headPage = readPage(bytes, 0);
  if (!headPage) throw new Error('no head');
  const head = packetsOfPage(headPage, null).packets[0];
  if (!head) throw new Error('no head packet');
  const writer = new OggOpusWriter(head);
  let page = readPage(bytes, headPage.end);
  let audio = false;
  while (page) {
    if (audio) for (const packet of packetsOfPage(page, null).packets) writer.addPacket(packet);
    audio = true;
    page = readPage(bytes, page.end);
  }
  return new Uint8Array(await writer.finish(frames).arrayBuffer());
}

export function memoryBytes(bytes: Uint8Array): SoundBytes {
  return { byteLength: bytes.length, read: (start, end) => Promise.resolve(bytes.slice(start, end)) };
}

export interface Fixtures {
  files: Map<string, Uint8Array>;
  tone220: SoundInfo;
  tone330: SoundInfo;
  long: SoundInfo;
}

export async function loadFixtures(): Promise<Fixtures> {
  const files = new Map<string, Uint8Array>([
    ['tone220', await rewritten(await fetched(tone220), FIXTURE_FRAMES.short)],
    ['tone330', await rewritten(await fetched(tone330), FIXTURE_FRAMES.short)],
    ['long', await rewritten(await fetched(tone220Long), FIXTURE_FRAMES.long)],
  ]);
  return {
    files,
    tone220: { key: 'tone220', frames: FIXTURE_FRAMES.short, gainDb: 0 },
    tone330: { key: 'tone330', frames: FIXTURE_FRAMES.short, gainDb: 0 },
    long: { key: 'long', frames: FIXTURE_FRAMES.long, gainDb: 0 },
  };
}

export function layerOf(sound: SoundInfo, extra: Partial<LayerPlay> = {}): LayerPlay {
  return { sound, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

export function musicOf(tracks: SoundInfo[], extra: Partial<MusicPlay> = {}): MusicPlay {
  return { tracks, seed: 1, shuffle: false, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

export function tableOf(extra: Partial<TableSound> = {}): TableSound {
  return { revision: 1, silenced: false, silenceFade: { at: 0, ms: 0 }, music: null, outgoing: [], layers: [], outgoingLayers: [], ...extra };
}

export interface RenderScript {
  seconds: number;
  /** What happens at what context time: states, levels, whatever the test does. */
  at?: Array<[number, (player: SoundPlayer) => void]>;
  options?: Partial<SoundPlayerOptions>;
  /** Table time at context time 0. */
  tableBase?: number;
  /** Read at every look at the clock, for a test whose table clock moves its own way. */
  tableShift?: () => number;
  tickSeconds?: number;
  /** False: time goes on without waiting for what the player reads, as with bytes that are late. */
  settle?: boolean;
}

/**
 * Renders a player through an offline context: time stands at each step while the player ticks and its
 * decoding finishes, as a real one has time to in the 250 ms between ticks.
 */
export async function render(state: TableSound, fixtures: Pick<Fixtures, 'files'>, script: RenderScript): Promise<Float32Array> {
  const frames = Math.round(script.seconds * SOUND_RATE);
  const context = new OfflineAudioContext(2, frames, SOUND_RATE);
  const tableBase = script.tableBase ?? 0;
  const player = new SoundPlayer({
    context,
    tableNow: () => context.currentTime * 1000 + tableBase + (script.tableShift?.() ?? 0),
    resolve: (key) => {
      const bytes = fixtures.files.get(key);
      if (!bytes) throw new Error(`no fixture ${key}`);
      return memoryBytes(bytes);
    },
    ...script.options,
  });
  const settled = (): Promise<void> => (script.settle === false ? Promise.resolve() : player.settled());
  player.setState(state);
  await settled();
  const step = script.tickSeconds ?? 0.25;
  const events = script.at ?? [];
  const times = new Set<number>();
  for (let time = step; time < script.seconds; time += step) times.add(time);
  for (const [time] of events) times.add(time);
  for (const time of times) {
    void context.suspend(time).then(async () => {
      for (const [eventTime, event] of events) if (Math.abs(eventTime - time) < 1e-9) event(player);
      player.tick();
      await settled();
      if (script.settle === false) await new Promise((resolve) => setTimeout(resolve, 20));
      await context.resume();
    });
  }
  const rendered = await context.startRendering();
  player.dispose();
  return rendered.getChannelData(0).slice();
}

/** The sine at `frequency` in a stretch: its amplitude and its phase, to compare positions. */
export function sineAt(samples: Float32Array, from: number, count: number, frequency: number): { amplitude: number; phase: number } {
  let re = 0;
  let im = 0;
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * frequency * (from + i)) / SOUND_RATE;
    const sample = samples[from + i] ?? 0;
    re += sample * Math.cos(angle);
    im += sample * Math.sin(angle);
  }
  return { amplitude: (2 * Math.hypot(re, im)) / count, phase: Math.atan2(re, im) };
}

export function rmsAt(samples: Float32Array, from: number, count: number): number {
  let sum = 0;
  for (let i = from; i < from + count; i++) sum += (samples[i] ?? 0) ** 2;
  return Math.sqrt(sum / count);
}

/** The longest run of exact zeros in a stretch. */
export function longestSilence(samples: Float32Array, from: number, to: number): number {
  let longest = 0;
  let run = 0;
  for (let i = from; i < to; i++) {
    run = samples[i] === 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

export function largestStep(samples: Float32Array, from: number, to: number): number {
  let largest = 0;
  for (let i = from + 1; i < to; i++) largest = Math.max(largest, Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0)));
  return largest;
}

export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * SOUND_RATE);
}
