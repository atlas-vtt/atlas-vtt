import type { LayerPlay, MusicPlay, MusicRepeat, RoomId, SoundInfo, TableSound } from '../sound/soundTypes';
import { DEFAULT_ROOM } from '../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../sound/soundTypes';
import { changed, enteringLayer, enteringMusic, FADER_MS, leaving, OFFLINE_LEAD_MS, rampFade, ROOM_FADE_MS, SILENCE_FADE_MS, withoutFinished, withReverb } from './tableSound';

/**
 * Changes of the live mix. Each is pure and answers with the state it was given when it changes nothing,
 * so the owner can tell a refusal. None of them touches a saved mood.
 */

function withLayer(state: TableSound, key: string, change: (play: LayerPlay) => LayerPlay): TableSound {
  const play = state.layers.find((layer) => layer.sound.key === key);
  if (!play) return state;
  return changed(state, { layers: state.layers.map((layer) => (layer === play ? change(layer) : layer)) });
}

/** A Silence holds a mix; with none left there is nothing for it to hold. What it kept quiet and still fades out goes with it, or it would come up. */
function silenceLifted(now: number): Pick<TableSound, 'silenced' | 'silenceFade' | 'outgoing' | 'outgoingLayers'> {
  return { silenced: false, silenceFade: { at: now, ms: SILENCE_FADE_MS }, outgoing: [], outgoingLayers: [] };
}

/** What the first sound of an empty mix changes besides: it is meant to be heard. */
function liftedByFirstSound(state: TableSound, now: number): Partial<TableSound> {
  return state.silenced && !state.music && state.layers.length === 0 ? silenceLifted(now) : {};
}

/** A sound already in the mix, or a ninth layer, is refused. One coming back while it fades keeps its reverb unless told another. */
export function addLayer(state: TableSound, sound: SoundInfo, gainDb: number, now: number, fadeMs: number, leadMs = OFFLINE_LEAD_MS, reverb?: number): TableSound {
  const live = withoutFinished(state, now);
  if (live.layers.some((play) => play.sound.key === sound.key) || live.layers.length >= MAX_MOOD_LAYERS) return state;
  const fading = live.outgoingLayers.find((play) => play.sound.key === sound.key);
  if (fading) {
    return changed(live, {
      layers: [...live.layers, withReverb({ ...fading, gainDb, fade: rampFade(fading, now, fadeMs) }, reverb ?? fading.reverb)],
      outgoingLayers: live.outgoingLayers.filter((play) => play !== fading),
      ...liftedByFirstSound(live, now),
    });
  }
  return changed(live, { layers: [...live.layers, enteringLayer(sound, gainDb, now + leadMs, fadeMs, reverb)], ...liftedByFirstSound(live, now) });
}

export function removeLayer(state: TableSound, key: string, now: number, fadeMs: number): TableSound {
  const play = state.layers.find((layer) => layer.sound.key === key);
  if (!play) return state;
  const live = withoutFinished(state, now);
  return changed(live, {
    layers: live.layers.filter((layer) => layer !== play),
    outgoingLayers: [...live.outgoingLayers, leaving(play, now, fadeMs)],
  });
}

export function setLayerLevel(state: TableSound, key: string, gainDb: number, now: number): TableSound {
  return withLayer(state, key, (play) => ({ ...play, gainDb, fade: rampFade(play, now, FADER_MS) }));
}

export function setLayerReverb(state: TableSound, key: string, amount: number, now: number): TableSound {
  return withLayer(state, key, (play) => withReverb({ ...play, fade: rampFade(play, now, FADER_MS) }, amount));
}

export function setMusicReverb(state: TableSound, amount: number, now: number): TableSound {
  const { music } = state;
  return music ? changed(state, { music: withReverb({ ...music, fade: rampFade(music, now, FADER_MS) }, amount) }) : state;
}

/** The table's room; the one it is already is no change. */
export function setRoom(state: TableSound, id: RoomId, now: number, fadeMs = ROOM_FADE_MS): TableSound {
  if ((state.room?.id ?? DEFAULT_ROOM) === id) return state;
  return changed(state, { room: { id, fade: { at: now, ms: fadeMs } } });
}

export function setLayerMuted(state: TableSound, key: string, muted: boolean, now: number): TableSound {
  return withLayer(state, key, ({ muted: _muted, ...play }) => ({ ...play, ...(muted && { muted }), fade: rampFade(play, now, FADER_MS) }));
}

export function setMusicLevel(state: TableSound, gainDb: number, now: number): TableSound {
  const { music } = state;
  return music ? changed(state, { music: { ...music, gainDb, fade: rampFade(music, now, FADER_MS) } }) : state;
}

export function setMusicMuted(state: TableSound, muted: boolean, now: number): TableSound {
  if (!state.music) return state;
  const { muted: _muted, ...music } = state.music;
  return changed(state, { music: { ...music, ...(muted && { muted }), fade: rampFade(music, now, FADER_MS) } });
}

/** Starts a list where none plays, with the reverb the music had unless told another. */
export function startMusic(state: TableSound, tracks: SoundInfo[], shuffle: boolean, gainDb: number, seed: number, now: number, fadeMs: number, leadMs = OFFLINE_LEAD_MS, repeat?: MusicRepeat, reverb = state.music?.reverb): TableSound {
  const live = withoutFinished(state, now);
  const startAt = now + leadMs;
  const outgoing = live.music ? [...live.outgoing, leaving(live.music, startAt, fadeMs)] : live.outgoing;
  return changed(live, { music: enteringMusic(tracks, shuffle, gainDb, seed, startAt, fadeMs, repeat, reverb), outgoing, ...liftedByFirstSound(live, now) });
}

export function stopMusic(state: TableSound, now: number, fadeMs: number): TableSound {
  if (!state.music) return state;
  const live = withoutFinished(state, now);
  return changed(live, { music: null, outgoing: [...live.outgoing, leaving(state.music, now, fadeMs)] });
}

/** Fades everything out, and leaves nothing to come back: the end of a session, not a Silence. Under one it ends that too, and what it kept quiet just goes. */
export function stopAll(state: TableSound, now: number, fadeMs: number): TableSound {
  const live = withoutFinished(state, now);
  if (live.silenced) return changed(live, { music: null, layers: [], ...silenceLifted(now) });
  return changed(live, {
    music: null,
    layers: [],
    outgoing: live.music ? [...live.outgoing, leaving(live.music, now, fadeMs)] : live.outgoing,
    outgoingLayers: [...live.outgoingLayers, ...live.layers.map((play) => leaving(play, now, fadeMs))],
  });
}

/**
 * Silence fades the whole table and holds its places; nothing about what plays changes, so a second
 * press lands where it would have been.
 */
export function toggleSilence(state: TableSound, now: number): TableSound {
  return changed(state, { silenced: !state.silenced, silenceFade: { at: now, ms: SILENCE_FADE_MS } });
}



/** Whether two infos of one key would sound different. */
function sameInfo(a: SoundInfo, b: SoundInfo): boolean {
  return a.frames === b.frames && a.gainDb === b.gainDb && a.growing === b.growing && a.loop?.startFrame === b.loop?.startFrame && a.loop?.endFrame === b.loop?.endFrame;
}

/**
 * The table's sounds as their copies say now: a copy made while it played has its real length and loudness
 * once whole, and its loudness so far while it grows. Anything else of a play stays; nothing changes where
 * no info did.
 */
export function withCurrentInfos(state: TableSound, infoOfKey: (key: string) => SoundInfo | null): TableSound {
  let changes = 0;
  const current = (sound: SoundInfo): SoundInfo => {
    const info = infoOfKey(sound.key);
    if (!info || sameInfo(info, sound)) return sound;
    changes++;
    return info;
  };
  const music = <T extends MusicPlay>(play: T): T => {
    const tracks = play.tracks.map(current);
    return tracks.every((track, index) => track === play.tracks[index]) ? play : { ...play, tracks };
  };
  const layer = (play: LayerPlay): LayerPlay => {
    const sound = current(play.sound);
    return sound === play.sound ? play : { ...play, sound };
  };
  const next = {
    music: state.music && music(state.music),
    outgoing: state.outgoing.map(music),
    layers: state.layers.map(layer),
    outgoingLayers: state.outgoingLayers.map(layer),
  };
  return changes === 0 ? state : changed(state, next);
}
