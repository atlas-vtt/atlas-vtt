import type { SoundInfo } from '../sound/soundTypes';
import { playTrack, soundingMusic, soundingTrack } from './musicList';
import { addTrack, type MixTiming, type SoundMix } from './soundMix';
import type { ReadySounds } from './tableSound';

/** A track the GM wants sooner than the end of the list: on this press if it can play, else as soon as its copy is there. */
export interface SoonestTrack {
  sound: string;
  at: 'now' | 'next';
}

const keyAt = (mix: SoundMix, now: number): string | null => soundingTrack(mix.table, now)?.key ?? null;

/** The list with `track` right after the one sounding, moved there if it is on the list already. */
function withTrackNext(tracks: readonly SoundInfo[], track: SoundInfo, soundingKey: string | null): SoundInfo[] {
  const rest = tracks.filter((other) => other.key !== track.key);
  const after = rest.findIndex((other) => other.key === soundingKey);
  return [...rest.slice(0, after + 1), track, ...rest.slice(after + 1)];
}

/** A track follows the one sounding: it joins at that track's end and never cuts it. On a shuffled list too. Without music it starts. */
export function playNext(mix: SoundMix, track: SoundInfo, levelDb: number, timing: MixTiming): SoundMix {
  if (!mix.table.music) return addTrack(mix, track, levelDb, timing);
  const base = mix.listChange ?? mix.table.music;
  const soundingKey = keyAt(mix, timing.now);
  if (track.key === soundingKey) return mix;
  return { ...mix, listChange: { tracks: withTrackNext(base.tracks, track, soundingKey), shuffle: base.shuffle, next: track.key } };
}

/** A track plays now on a short crossfade, and the list goes on from it. Without music it starts. */
export function playNow(mix: SoundMix, track: SoundInfo, levelDb: number, timing: MixTiming): SoundMix {
  if (!mix.table.music) return addTrack(mix, track, levelDb, timing);
  const soundingKey = keyAt(mix, timing.now);
  if (track.key === soundingKey) return mix;
  const base = mix.listChange ?? mix.table.music;
  const tracks = withTrackNext(base.tracks, track, soundingKey);
  return { ...mix, table: playTrack(mix.table, track.key, timing.now, timing.leadMs, { tracks, shuffle: base.shuffle }), listChange: null };
}

/** What waited for its copy to play sooner than the rest: once the copy is here, it goes where it was asked to. */
export function applySoonest(mix: SoundMix, sounds: ReadySounds, timing: MixTiming): SoundMix {
  const { soonest } = mix;
  const track = soonest && sounds.get(soonest.sound);
  if (!soonest || !track) return mix;
  const levelDb = mix.table.music?.gainDb ?? 0;
  const { soonest: _taken, ...without } = mix;
  return soonest.at === 'now' ? playNow(without, track, levelDb, timing) : playNext(without, track, levelDb, timing);
}

/** The record ids and keys of what a mix holds: what the library's rows ask of it. */
export interface MixHolding {
  /** A track on the list, with its key once it has a copy. */
  tracks: ReadonlyMap<string, string | null>;
  /** A layer, with its key once it has a copy. */
  layers: ReadonlyMap<string, string | null>;
}

/** What the mix holds, in record ids: a sound counts from the press on, whether its copy is here or not. */
export function mixHolding(mix: SoundMix, now: number, idOfKey: (key: string) => string | null): MixHolding {
  const tracks = new Map<string, string | null>();
  const layers = new Map<string, string | null>();
  const list = mix.listChange ?? soundingMusic(mix.table, now);
  for (const track of list?.tracks ?? []) {
    const id = idOfKey(track.key);
    if (id) tracks.set(id, track.key);
  }
  for (const id of mix.waitingMusic?.tracks ?? []) tracks.set(id, null);
  for (const layer of mix.table.layers) {
    const id = idOfKey(layer.sound.key);
    if (id) layers.set(id, layer.sound.key);
  }
  for (const layer of mix.waitingLayers) layers.set(layer.sound, null);
  return { tracks, layers };
}
