import type { LayerPlay, MoodMusic, MusicPlay, MusicRepeat, RoomId, SoundFade, SoundInfo, TableSound } from '../sound/soundTypes';
import { fadeProgress } from '../sound/engine/soundMath';

/** How far ahead of now a change begins on one machine; a table online asks for more. */
export const OFFLINE_LEAD_MS = 50;
/** A fader move: soon enough to feel direct, long enough not to click. */
export const FADER_MS = 60;
export const SILENCE_FADE_MS = 1500;
/** A skip is a short crossfade, not a mood's. */
export const SKIP_FADE_MS = 1500;
/** A drag along a track's waveform: long enough to leave no click, short enough to be a jump. */
export const SEEK_FADE_MS = 150;
/** Where a changed list takes over from the old one, at a track's end. */
export const TRACK_JOIN_MS = 40;
/** Stop after this track: how long before its end it starts to leave. */
export const STOP_AFTER_FADE_MS = 1500;

/** A room change made at the desk: as long as a skip, so the old room rings out under the new. */
export const ROOM_FADE_MS = 1500;

/** What a mood press needs of a mood, which a mix being restored has too. */
export type MoodMix = { fadeSeconds: number; music: MoodMusic; layers: { sound: string; levelDb: number; reverb?: number }[]; room?: RoomId };

/** A reverb amount as a play keeps it: 0 to 1, and dry is no field. */
export function withReverb<T extends object>(play: T, amount: number | undefined): T {
  const { reverb: _old, ...rest } = play as T & { reverb?: number };
  const kept = amount === undefined || !Number.isFinite(amount) ? 0 : Math.max(0, Math.min(1, amount));
  return (kept > 0 ? { ...rest, reverb: kept } : rest) as T;
}

/** The sounds that can play now, by record id. A sound without a copy yet is not in it. */
export type ReadySounds = ReadonlyMap<string, SoundInfo>;

export const EMPTY_TABLE_SOUND: TableSound = {
  revision: 0,
  silenced: false,
  silenceFade: { at: 0, ms: 0 },
  music: null,
  outgoing: [],
  layers: [],
  outgoingLayers: [],
};

const isUnderWay = (fade: SoundFade, now: number): boolean => fadeProgress(fade.at, fade.ms, now) < 1;

/** Whether anything sounds or may sound again: Silence holds a mix, and a fade out is still heard. */
export function isPlaying(state: TableSound, now: number): boolean {
  return state.music !== null || state.layers.length > 0 || state.outgoing.some((play) => isUnderWay(play.fade, now)) || state.outgoingLayers.some((play) => isUnderWay(play.fade, now));
}

/** What has finished fading out is dropped, so a long session's state stays small. */
export function withoutFinished(state: TableSound, now: number): TableSound {
  const outgoing = state.outgoing.filter((play) => isUnderWay(play.fade, now));
  const outgoingLayers = state.outgoingLayers.filter((play) => isUnderWay(play.fade, now));
  return outgoing.length === state.outgoing.length && outgoingLayers.length === state.outgoingLayers.length ? state : { ...state, outgoing, outgoingLayers };
}

/**
 * A fade that moves what already sounds: a play reads a fade beginning where the play begins as coming
 * in, so this one never begins there.
 */
export function rampFade(play: { startAt: number }, now: number, ms: number): SoundFade {
  return { at: Math.max(now, play.startAt + 1), ms };
}

export function enteringMusic(tracks: SoundInfo[], shuffle: boolean, gainDb: number, seed: number, startAt: number, fadeMs: number, repeat?: MusicRepeat, reverb?: number): MusicPlay {
  return withReverb({ tracks, seed, shuffle, startAt, gainDb, fade: { at: startAt, ms: fadeMs }, ...(repeat && { repeat }) }, reverb);
}

export function enteringLayer(sound: SoundInfo, gainDb: number, startAt: number, fadeMs: number, reverb?: number): LayerPlay {
  return withReverb({ sound, startAt, gainDb, fade: { at: startAt, ms: fadeMs } }, reverb);
}

export function leaving<T extends MusicPlay | LayerPlay>(play: T, at: number, ms: number): T {
  return { ...play, fade: { at, ms } };
}

/** Every change of state is one revision. */
export function changed(state: TableSound, change: Partial<TableSound>): TableSound {
  return { ...state, ...change, revision: state.revision + 1 };
}

/** A state moved onto a clock `deltaMs` ahead of the one it was made on: what plays stays at its position, and a play coming in still reads as coming in. */
export function onShiftedClock(state: TableSound, deltaMs: number): TableSound {
  const shifted = <T extends MusicPlay | LayerPlay>(play: T): T => ({ ...play, startAt: play.startAt + deltaMs, fade: { ...play.fade, at: play.fade.at + deltaMs } });
  return changed(state, {
    silenceFade: { ...state.silenceFade, at: state.silenceFade.at + deltaMs },
    ...(state.room && { room: { ...state.room, fade: { ...state.room.fade, at: state.room.fade.at + deltaMs } } }),
    music: state.music && shifted(state.music),
    outgoing: state.outgoing.map(shifted),
    layers: state.layers.map(shifted),
    outgoingLayers: state.outgoingLayers.map(shifted),
  });
}

/** A fade out when sound is switched off: the GM's choice, within reason, since something else is under way. */
export const stopFade = (fadeMs: number): number => Math.min(fadeMs, 2000);
