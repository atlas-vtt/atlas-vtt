import { SoundPlayer } from '@/app/sound/engine/soundPlayer';
import type { WindowDecode } from '@/app/sound/engine/windowDecoder';
import type { LayerPlay, MusicPlay, SoundBytes, SoundInfo, TableSound } from '@/app/sound/soundTypes';
import { FakeSoundContext } from './fakeSoundContext';

export const RATE = 48000;

export function sound(key: string, seconds = 10): SoundInfo {
  return { key, frames: seconds * RATE, gainDb: 0 };
}

export function layer(info: SoundInfo, extra: Partial<LayerPlay> = {}): LayerPlay {
  return { sound: info, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

export function music(tracks: SoundInfo[], extra: Partial<MusicPlay> = {}): MusicPlay {
  return { tracks, seed: 1, shuffle: false, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

export function table(extra: Partial<TableSound> = {}): TableSound {
  return { revision: 1, silenced: false, silenceFade: { at: 0, ms: 0 }, music: null, outgoing: [], layers: [], outgoingLayers: [], ...extra };
}

export const emptyBytes: SoundBytes = { byteLength: 4, read: () => Promise.resolve(new Uint8Array(4)) };

export interface PlayerRig {
  context: FakeSoundContext;
  player: SoundPlayer;
  /** Table time and context time move together, unless `tableOffset` says otherwise. */
  advance(seconds: number): Promise<void>;
  tableOffset: { ms: number };
  errors: string[];
}

export function playerRig(resolve: (key: string) => SoundBytes | Promise<SoundBytes> = () => emptyBytes, windowDecode?: WindowDecode): PlayerRig {
  const context = new FakeSoundContext();
  const tableOffset = { ms: 0 };
  const errors: string[] = [];
  const player = new SoundPlayer({
    context,
    tableNow: () => context.currentTime * 1000 + tableOffset.ms,
    resolve,
    onSoundError: (key) => errors.push(key),
    ...(windowDecode ? { windowDecode: () => windowDecode } : {}),
  });
  return {
    context,
    player,
    tableOffset,
    errors,
    advance: async (seconds) => {
      context.currentTime += seconds;
      player.tick();
      await player.settled();
    },
  };
}
