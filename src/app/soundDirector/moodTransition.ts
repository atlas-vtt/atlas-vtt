import { DEFAULT_ROOM, type LayerPlay, type MusicPlay, type SoundInfo, type TableSound } from '../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../sound/soundTypes';
import { fnv1a32 } from '../utils/hashing';
import { changed, enteringLayer, enteringMusic, leaving, OFFLINE_LEAD_MS, rampFade, SILENCE_FADE_MS, withoutFinished, withReverb, type MoodMix, type ReadySounds } from './tableSound';

function isSameList(play: MusicPlay, tracks: readonly SoundInfo[], shuffle: boolean): boolean {
  if (play.shuffle !== shuffle || play.tracks.length !== tracks.length) return false;
  if (!shuffle) return play.tracks.every((track, index) => track.key === tracks[index]?.key);
  const keys = new Set(play.tracks.map((track) => track.key));
  return tracks.every((track) => keys.has(track.key));
}

function readyTracks(ids: readonly string[], sounds: ReadySounds): SoundInfo[] {
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    const info = sounds.get(id);
    if (!info || seen.has(info.key)) return [];
    seen.add(info.key);
    return [info];
  });
}

function nextMusic(live: TableSound, mix: MoodMix, sounds: ReadySounds, now: number, startAt: number, fadeMs: number): Pick<TableSound, 'music' | 'outgoing'> {
  const { music: wanted } = mix;
  if (wanted === 'keep') return { music: live.music, outgoing: live.outgoing };
  const leaveAll = (): MusicPlay[] => (live.music ? [...live.outgoing, leaving(live.music, startAt, fadeMs)] : live.outgoing);
  const tracks = wanted === 'none' ? [] : readyTracks(wanted.tracks, sounds);
  if (wanted === 'none' || tracks.length === 0) return { music: null, outgoing: leaveAll() };
  const kept = live.music && isSameList(live.music, tracks, wanted.shuffle) ? live.music : live.outgoing.find((play) => isSameList(play, tracks, wanted.shuffle));
  if (kept) {
    const { muted: _muted, ...play } = kept;
    const outgoing = kept === live.music ? live.outgoing : [...live.outgoing.filter((other) => other !== kept), ...(live.music ? [leaving(live.music, startAt, fadeMs)] : [])];
    return { music: withReverb({ ...play, gainDb: wanted.levelDb, fade: rampFade(kept, now, fadeMs) }, wanted.reverb), outgoing };
  }
  const seed = fnv1a32(`${now}|${tracks.map((track) => track.key).join(',')}`);
  return { music: enteringMusic(tracks, wanted.shuffle, wanted.levelDb, seed, startAt, fadeMs, wanted.repeat, wanted.reverb), outgoing: leaveAll() };
}

function nextLayers(live: TableSound, mix: MoodMix, sounds: ReadySounds, now: number, startAt: number, fadeMs: number): Pick<TableSound, 'layers' | 'outgoingLayers'> {
  const seen = new Set<string>();
  const layers: LayerPlay[] = [];
  for (const { sound, levelDb, reverb } of mix.layers) {
    const info = sounds.get(sound);
    if (!info || seen.has(info.key) || layers.length === MAX_MOOD_LAYERS) continue;
    seen.add(info.key);
    const kept = live.layers.find((play) => play.sound.key === info.key) ?? live.outgoingLayers.find((play) => play.sound.key === info.key);
    if (kept) {
      const { muted: _muted, ...play } = kept;
      layers.push(withReverb({ ...play, gainDb: levelDb, fade: rampFade(kept, now, fadeMs) }, reverb));
    } else {
      layers.push(enteringLayer(info, levelDb, startAt, fadeMs, reverb));
    }
  }
  const stillFading = live.outgoingLayers.filter((play) => !seen.has(play.sound.key));
  const leavingNow = live.layers.filter((play) => !seen.has(play.sound.key)).map((play) => leaving(play, startAt, fadeMs));
  return { layers, outgoingLayers: [...stillFading, ...leavingNow] };
}

/**
 * The state a mood press makes: one state, however much it changes. What both moods share keeps its
 * place and only moves to its new level; the rest comes in over the mood's fade as what it replaces
 * leaves. A sound not in `sounds` has no copy yet and joins later. A press also ends a Silence, since
 * it asks the room to sound like this.
 */
export function moodTransition(state: TableSound, mood: MoodMix, sounds: ReadySounds, now: number, leadMs = OFFLINE_LEAD_MS): TableSound {
  const live = withoutFinished(state, now);
  const startAt = now + leadMs;
  const fadeMs = Math.max(0, mood.fadeSeconds * 1000);
  const room = mood.room ?? DEFAULT_ROOM;
  return changed(live, {
    ...nextMusic(live, mood, sounds, now, startAt, fadeMs),
    ...nextLayers(live, mood, sounds, now, startAt, fadeMs),
    // The room changes on the mood's fade, so the old room's tail rings out under the new.
    ...(room !== (live.room?.id ?? DEFAULT_ROOM) && { room: { id: room, fade: { at: startAt, ms: fadeMs } } }),
    ...(live.silenced && { silenced: false, silenceFade: { at: now, ms: SILENCE_FADE_MS } }),
  });
}
