import type { MoodLayer, MoodMusic, SoundInfo, TableSound } from '../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../sound/soundTypes';
import { fnv1a32 } from '../utils/hashing';
import { addLayer, removeLayer, startMusic, stopMusic } from './liveEdits';
import { moodTransition } from './moodTransition';
import { listChangeAt, playTrack, soundingMusic, withListChange, type ListChange } from './musicList';
import { EMPTY_TABLE_SOUND, type MoodMix, type ReadySounds } from './tableSound';

export interface ActiveMood {
  collectionId: string;
  id: string;
}

export interface WaitingMusic {
  /** Record ids. */
  tracks: string[];
  shuffle: boolean;
  levelDb: number;
}

/**
 * What the GM has asked to hear: the table's state, which holds only what can play, and what waits for
 * its copy to join it. The table's state alone goes to players.
 */
export interface SoundMix {
  table: TableSound;
  mood: ActiveMood | null;
  waitingMusic: WaitingMusic | null;
  waitingLayers: MoodLayer[];
  /** A change of the list, waiting for the current track's end. */
  listChange: ListChange | null;
}

export const EMPTY_MIX: SoundMix = { table: EMPTY_TABLE_SOUND, mood: null, waitingMusic: null, waitingLayers: [], listChange: null };

/** How the owner places what it changes. */
export interface MixTiming {
  now: number;
  leadMs: number;
  fadeMs: number;
}

function waitingOf(music: MoodMusic, sounds: ReadySounds, known: (id: string) => boolean): WaitingMusic | null {
  if (typeof music === 'string') return null;
  const tracks = music.tracks.filter((id) => !sounds.has(id) && known(id));
  return tracks.length > 0 ? { tracks, shuffle: music.shuffle, levelDb: music.levelDb } : null;
}

/** One press of a mood. `known` tells a sound still to come from one that was deleted, which is skipped. */
export function pressMood(mix: SoundMix, mood: MoodMix, active: ActiveMood | null, sounds: ReadySounds, known: (id: string) => boolean, now: number, leadMs: number): SoundMix {
  const keep = mood.music === 'keep';
  return {
    table: moodTransition(mix.table, mood, sounds, now, leadMs),
    mood: active,
    waitingMusic: keep ? mix.waitingMusic : waitingOf(mood.music, sounds, known),
    waitingLayers: mood.layers.filter(({ sound }) => !sounds.has(sound) && known(sound)).slice(0, MAX_MOOD_LAYERS),
    listChange: keep ? mix.listChange : null,
  };
}

/** Brings in what became ready: a layer now, a track at the current one's end, or at once where no music plays. */
export function joinReady(mix: SoundMix, sounds: ReadySounds, { now, leadMs, fadeMs }: MixTiming): SoundMix {
  let { table, waitingMusic, waitingLayers, listChange } = mix;
  const stillWaiting: MoodLayer[] = [];
  for (const layer of waitingLayers) {
    const info = sounds.get(layer.sound);
    if (info) table = addLayer(table, info, layer.levelDb, now, fadeMs, leadMs);
    else stillWaiting.push(layer);
  }
  waitingLayers = stillWaiting.length === mix.waitingLayers.length ? mix.waitingLayers : stillWaiting;
  if (waitingMusic) {
    const { shuffle, levelDb } = waitingMusic;
    const arrived = waitingMusic.tracks.flatMap((id) => sounds.get(id) ?? []);
    if (arrived.length > 0) {
      const tracks = waitingMusic.tracks.filter((id) => !sounds.has(id));
      waitingMusic = tracks.length > 0 ? { ...waitingMusic, tracks } : null;
      if (table.music) {
        const base = listChange ?? table.music;
        const known = new Set(base.tracks.map((track) => track.key));
        listChange = { tracks: [...base.tracks, ...arrived.filter((track) => !known.has(track.key))], shuffle: base.shuffle };
      } else {
        table = startMusic(table, arrived, shuffle, levelDb, fnv1a32(`${now}`), now, fadeMs, leadMs);
      }
    }
  }
  if (table === mix.table && waitingMusic === mix.waitingMusic && waitingLayers === mix.waitingLayers && listChange === mix.listChange) return mix;
  return { ...mix, table, waitingMusic, waitingLayers, listChange };
}

/** Takes a waiting change of the list in shortly before its track ends: close enough for a slider to go on working until then. */
export function applyDueListChange(mix: SoundMix, now: number, aheadMs: number): SoundMix {
  if (!mix.listChange) return mix;
  const at = listChangeAt(mix.table, now);
  if (at === null) return { ...mix, listChange: null };
  if (at - now > aheadMs) return mix;
  return { ...mix, table: withListChange(mix.table, mix.listChange, at), listChange: null };
}

/** A track joins the list; the first one starts it. A track already on the list is refused. */
export function addTrack(mix: SoundMix, track: SoundInfo, levelDb: number, { now, leadMs, fadeMs }: MixTiming): SoundMix {
  if (!mix.table.music) return { ...mix, table: startMusic(mix.table, [track], false, levelDb, fnv1a32(`${now}`), now, fadeMs, leadMs) };
  const base = mix.listChange ?? mix.table.music;
  if (base.tracks.some((other) => other.key === track.key)) return mix;
  return { ...mix, listChange: { tracks: [...base.tracks, track], shuffle: base.shuffle } };
}

/** A track leaves the list. The one sounding gives way to the rest now; the last one ends the music. */
export function removeTrack(mix: SoundMix, key: string, { now, leadMs, fadeMs }: MixTiming, nowPlaying: string | null): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  if (!base) return mix;
  const tracks = base.tracks.filter((track) => track.key !== key);
  if (tracks.length === base.tracks.length) return mix;
  if (tracks.length === 0) return { ...mix, table: stopMusic(mix.table, now, fadeMs), listChange: null };
  const change = { tracks, shuffle: base.shuffle };
  if (key !== nowPlaying) return { ...mix, listChange: change };
  const first = tracks[0];
  return first ? { ...mix, table: playTrack(mix.table, first.key, now, leadMs, change), listChange: null } : mix;
}

/** Shuffle takes over at the current track's end, so it never cuts one. */
export function setShuffle(mix: SoundMix, shuffle: boolean): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  return base && base.shuffle !== shuffle ? { ...mix, listChange: { tracks: base.tracks, shuffle } } : mix;
}

/** Takes a layer out of the mix, waiting or playing. */
export function dropLayer(mix: SoundMix, soundId: string, key: string | null, now: number, fadeMs: number): SoundMix {
  const waitingLayers = mix.waitingLayers.filter((layer) => layer.sound !== soundId);
  const table = key === null ? mix.table : removeLayer(mix.table, key, now, fadeMs);
  return { ...mix, table, waitingLayers };
}

export const dropWaitingTrack = (mix: SoundMix, soundId: string): SoundMix => {
  if (!mix.waitingMusic) return mix;
  const tracks = mix.waitingMusic.tracks.filter((id) => id !== soundId);
  return { ...mix, waitingMusic: tracks.length > 0 ? { ...mix.waitingMusic, tracks } : null };
};

/**
 * What a mix would save as: what is heard or coming, in record ids. A muted layer is not heard, and
 * no music is `none`, so pressing the mood later makes the room sound as it does now.
 */
export function mixAsMood(mix: SoundMix, idOf: (key: string) => string | null, fadeSeconds: number, now: number): MoodMix {
  const play = soundingMusic(mix.table, now);
  const list = mix.listChange ?? play;
  const tracks = [...(list?.tracks ?? []).flatMap((track) => idOf(track.key) ?? []), ...(mix.waitingMusic?.tracks ?? [])];
  const music: MoodMusic = play?.muted === true || tracks.length === 0
    ? 'none'
    : { tracks, shuffle: list?.shuffle ?? mix.waitingMusic?.shuffle ?? false, levelDb: play?.gainDb ?? mix.waitingMusic?.levelDb ?? 0 };
  const layers = [
    ...mix.table.layers.flatMap((layer) => {
      const sound = layer.muted === true ? null : idOf(layer.sound.key);
      return sound ? [{ sound, levelDb: layer.gainDb }] : [];
    }),
    ...mix.waitingLayers,
  ];
  return { fadeSeconds, music, layers };
}
