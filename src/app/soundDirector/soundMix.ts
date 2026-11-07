import type { MoodLayer, MoodMusic, MusicRepeat, SoundInfo, TableSound } from '../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../sound/soundTypes';
import { fnv1a32 } from '../utils/hashing';
import { addLayer, removeLayer, startMusic, stopMusic } from './liveEdits';
import { moodTransition } from './moodTransition';
import { changeOf, sameOrder } from './listPlace';
import { musicPosition, playTrack, soundingMusic, type ListChange } from './musicList';
import type { SoonestTracks } from './libraryMix';
import type { PausedMusic } from './musicPause';
import { EMPTY_TABLE_SOUND, withReverb, type MoodMix, type ReadySounds } from './tableSound';

export interface ActiveMood {
  id: string;
}

export interface WaitingMusic {
  /** Record ids. */
  tracks: string[];
  shuffle: boolean;
  levelDb: number;
  repeat?: MusicRepeat;
  reverb?: number;
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
  /** The key of a track the GM wants the music to stop after. Their intent, never on the wire: it goes when another track takes this one's place. */
  stopAfter: string | null;
  /** Tracks, of `waitingMusic` or waiting for their turn behind it, the GM wants sooner than the end of the list. */
  soonest?: SoonestTracks;
  /** The music the GM paused, never on the wire (`musicPause`). */
  paused?: PausedMusic;
}

export const EMPTY_MIX: SoundMix = { table: EMPTY_TABLE_SOUND, mood: null, waitingMusic: null, waitingLayers: [], listChange: null, stopAfter: null };

/** How the owner places what it changes. */
export interface MixTiming {
  now: number;
  leadMs: number;
  fadeMs: number;
}

function waitingOf(music: MoodMusic, sounds: ReadySounds, known: (id: string) => boolean): WaitingMusic | null {
  if (typeof music === 'string') return null;
  const tracks = music.tracks.filter((id) => !sounds.has(id) && known(id));
  return tracks.length > 0 ? withReverb({ tracks, shuffle: music.shuffle, levelDb: music.levelDb, ...(music.repeat && { repeat: music.repeat }) }, music.reverb) : null;
}

/** One press of a mood. `known` tells a sound still to come from one that was deleted, which is skipped. */
export function pressMood(mix: SoundMix, mood: MoodMix, active: ActiveMood | null, sounds: ReadySounds, known: (id: string) => boolean, now: number, leadMs: number): SoundMix {
  const keep = mood.music === 'keep';
  const table = moodTransition(mix.table, mood, sounds, now, leadMs);
  // A list both moods share goes on as it is; how it ends changes at its track's end, as any list does.
  const shared = typeof mood.music === 'object' && table.music && table.music.repeat !== mood.music.repeat ? changeOf({ shuffle: table.music.shuffle, repeat: mood.music.repeat }, table.music.tracks) : null;
  return {
    table,
    mood: active,
    waitingMusic: keep ? mix.waitingMusic : waitingOf(mood.music, sounds, known),
    waitingLayers: mood.layers.filter(({ sound }) => !sounds.has(sound) && known(sound)).slice(0, MAX_MOOD_LAYERS),
    listChange: keep ? mix.listChange : shared,
    stopAfter: keep ? mix.stopAfter : null,
  };
}

/** Brings in what became ready: a layer now, a track at the current one's end, or at once where no music plays. */
export function joinReady(mix: SoundMix, sounds: ReadySounds, { now, leadMs, fadeMs }: MixTiming): SoundMix {
  let { table, waitingMusic, waitingLayers, listChange } = mix;
  const stillWaiting: MoodLayer[] = [];
  for (const layer of waitingLayers) {
    const info = sounds.get(layer.sound);
    if (info) table = addLayer(table, info, layer.levelDb, now, fadeMs, leadMs, layer.reverb);
    else stillWaiting.push(layer);
  }
  waitingLayers = stillWaiting.length === mix.waitingLayers.length ? mix.waitingLayers : stillWaiting;
  if (waitingMusic) {
    const { shuffle, levelDb, repeat, reverb } = waitingMusic;
    const arrived = waitingMusic.tracks.flatMap((id) => sounds.get(id) ?? []);
    if (arrived.length > 0) {
      const tracks = waitingMusic.tracks.filter((id) => !sounds.has(id));
      waitingMusic = tracks.length > 0 ? { ...waitingMusic, tracks } : null;
      if (table.music) {
        const base = listChange ?? table.music;
        const known = new Set(base.tracks.map((track) => track.key));
        listChange = changeOf(base, [...base.tracks, ...arrived.filter((track) => !known.has(track.key))]);
      } else {
        table = startMusic(table, arrived, shuffle, levelDb, fnv1a32(`${now}`), now, fadeMs, leadMs, repeat, reverb);
      }
    }
  }
  if (table === mix.table && waitingMusic === mix.waitingMusic && waitingLayers === mix.waitingLayers && listChange === mix.listChange) return mix;
  return { ...mix, table, waitingMusic, waitingLayers, listChange };
}

/** A change waits for the track's end; one that leaves the list as it plays is no change. */
function withChange(mix: SoundMix, change: ListChange): SoundMix {
  const play = mix.table.music;
  return { ...mix, listChange: play && sameOrder(play, change) && play.repeat === change.repeat ? null : change };
}

/** A track joins the list; the first one starts it. A track already on the list is refused. */
export function addTrack(mix: SoundMix, track: SoundInfo, levelDb: number, { now, leadMs, fadeMs }: MixTiming): SoundMix {
  if (!mix.table.music) return { ...mix, table: startMusic(mix.table, [track], false, levelDb, fnv1a32(`${now}`), now, fadeMs, leadMs) };
  const base = mix.listChange ?? mix.table.music;
  if (base.tracks.some((other) => other.key === track.key)) return mix;
  return withChange(mix, changeOf(base, [...base.tracks, track]));
}

/** A track leaves the list. The one sounding gives way to the rest now; the last one ends the music. */
export function removeTrack(mix: SoundMix, key: string, { now, leadMs, fadeMs }: MixTiming, nowPlaying: string | null): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  if (!base) return mix;
  const tracks = base.tracks.filter((track) => track.key !== key);
  if (tracks.length === base.tracks.length) return mix;
  if (tracks.length === 0) return { ...mix, table: stopMusic(mix.table, now, fadeMs), listChange: null };
  const change = changeOf(base, tracks);
  if (key !== nowPlaying) return withChange(mix, change);
  // What followed it, which now stands in its place on the list.
  const following = tracks[base.tracks.findIndex((track) => track.key === key)];
  if (!following && base.repeat === 'off') return { ...mix, table: stopMusic(mix.table, now, fadeMs), listChange: null };
  const next = following ?? tracks[0];
  return next ? { ...mix, table: playTrack(mix.table, next.key, now, leadMs, change), listChange: null } : mix;
}

/** Shuffle takes over at the current track's end, so it never cuts one. */
export function setShuffle(mix: SoundMix, shuffle: boolean): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  return base && base.shuffle !== shuffle ? withChange(mix, changeOf({ shuffle, repeat: base.repeat }, base.tracks)) : mix;
}

/** How the list goes on past its end, from the current track's end on, so what plays carries on undisturbed. */
export function setRepeat(mix: SoundMix, repeat: MusicRepeat | undefined): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  if (!base || base.repeat === repeat) return mix;
  return withChange(mix, changeOf({ shuffle: base.shuffle, repeat }, base.tracks));
}

/** A track to another place on the list. While shuffled the order is the seed's. */
export function moveTrack(mix: SoundMix, key: string, index: number): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  const moved = base?.tracks.find((track) => track.key === key);
  if (!base || !moved || base.shuffle) return mix;
  const others = base.tracks.filter((track) => track !== moved);
  return withChange(mix, changeOf(base, [...others.slice(0, index), moved, ...others.slice(index)]));
}

/** Keeps the track playing, and nothing comes after it but what its repeat says. */
export function clearComing(mix: SoundMix, now: number): SoundMix {
  const base = mix.listChange ?? mix.table.music;
  const playing = mix.table.music && musicPosition(mix.table.music, now)?.track;
  if (!base || !playing) return mix;
  const { soonest: _dropped, ...rest } = mix;
  return withChange({ ...rest, waitingMusic: null }, changeOf(base, [playing]));
}

/** A stop asked for one track goes once another has taken its place, by whatever road. */
export function withStopStillMeant(mix: SoundMix, now: number): SoundMix {
  if (mix.stopAfter === null) return mix;
  const play = mix.table.music;
  return play && musicPosition(play, now)?.track.key === mix.stopAfter ? mix : { ...mix, stopAfter: null };
}

/** Takes a layer out of the mix, waiting or playing. */
export function dropLayer(mix: SoundMix, soundId: string, key: string | null, now: number, fadeMs: number): SoundMix {
  const waitingLayers = mix.waitingLayers.filter((layer) => layer.sound !== soundId);
  const table = key === null ? mix.table : removeLayer(mix.table, key, now, fadeMs);
  return { ...mix, table, waitingLayers };
}

/** A sound the GM took out goes nowhere any more. */
export function withoutSoonest(mix: SoundMix, soundId: string | null): SoundMix {
  const { soonest, ...rest } = mix;
  if (!soonest || soundId === null || !soonest.sounds.includes(soundId)) return mix;
  const sounds = soonest.sounds.filter((id) => id !== soundId);
  return sounds.length > 0 ? { ...rest, soonest: { ...soonest, sounds } } : rest;
}

export const dropWaitingTrack = (mix: SoundMix, soundId: string): SoundMix => {
  if (!mix.waitingMusic) return mix;
  const tracks = mix.waitingMusic.tracks.filter((id) => id !== soundId);
  return { ...withoutSoonest(mix, soundId), waitingMusic: tracks.length > 0 ? { ...mix.waitingMusic, tracks } : null };
};

/**
 * What a mix would save as: what is heard or coming, in record ids. A muted layer is not heard, and
 * no music is `none`, so pressing the mood later makes the room sound as it does now.
 */
export function mixAsMood(mix: SoundMix, idOf: (key: string) => string | null, fadeSeconds: number, now: number): MoodMix {
  // Paused music is still the mix's music: a mood saved meanwhile keeps it.
  const play = soundingMusic(mix.table, now) ?? mix.paused?.play ?? null;
  const list = mix.listChange ?? play;
  const tracks = [...(list?.tracks ?? []).flatMap((track) => idOf(track.key) ?? []), ...(mix.waitingMusic?.tracks ?? [])];
  const repeat = list ? list.repeat : mix.waitingMusic?.repeat;
  const music: MoodMusic = play?.muted === true || tracks.length === 0
    ? 'none'
    : withReverb({ tracks, shuffle: list?.shuffle ?? mix.waitingMusic?.shuffle ?? false, levelDb: play?.gainDb ?? mix.waitingMusic?.levelDb ?? 0, ...(repeat && { repeat }) }, play?.reverb ?? mix.waitingMusic?.reverb);
  const layers = [
    ...mix.table.layers.flatMap((layer) => {
      const sound = layer.muted === true ? null : idOf(layer.sound.key);
      return sound ? [withReverb({ sound, levelDb: layer.gainDb }, layer.reverb)] : [];
    }),
    ...mix.waitingLayers,
  ];
  return { fadeSeconds, music, layers, ...(mix.table.room && { room: mix.table.room.id }) };
}
