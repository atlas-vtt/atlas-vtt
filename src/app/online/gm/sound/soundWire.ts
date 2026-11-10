import { MAX_SOUND_LAYERS, MAX_SOUND_OUTGOING, MAX_SOUND_TRACKS, type SharedLayerPlay, type SharedMusicPlay, type SharedSoundInfo, type SharedTableSound, type AssetRef } from '../../protocol/index.ts';
import type { LayerPlay, MusicPlay, SoundInfo, TableSound } from '../../../sound/soundTypes';

/** The quietest a level goes on the wire: JSON has no -Infinity, and this is silence. */
const WIRE_SILENCE_DB = -120;

const wireDb = (db: number): number => (Number.isFinite(db) ? Math.max(db, WIRE_SILENCE_DB) : db > 0 ? 0 : WIRE_SILENCE_DB);

/**
 * What a state's sound is told by: its key on the wire and its reference where the store keeps it. No
 * credit goes with it: rights to a sound, and whose it is, are the GM's to know (owner, 2026-11-04).
 */
export interface WireSound {
  readonly key: string;
  readonly asset?: AssetRef | undefined;
}

/**
 * Every key a state names: what goes up for players, and what must have a reference before the state
 * goes out. Longer lists than the wire carries lose their last tracks.
 * ponytail: the library holds a list to 500 tracks and only Play now goes past that, so a cut needs a dozen of those on a full list; the list then drifts from the GM's after the cut.
 */
export function keysOfState(state: TableSound): string[] {
  const tracks = (play: MusicPlay): SoundInfo[] => play.tracks.slice(0, MAX_SOUND_TRACKS);
  const sounds = [...(state.music ? tracks(state.music) : []), ...state.outgoing.flatMap(tracks), ...state.layers.map((play) => play.sound), ...state.outgoingLayers.map((play) => play.sound)];
  return [...new Set(sounds.map((sound) => sound.key))];
}

/** A state as players are sent it: every key the store's id or a stand-in, every level one JSON can carry, and no field but those a page reads. */
export function wireState(state: TableSound, soundOf: (key: string) => WireSound): SharedTableSound {
  const info = (sound: SoundInfo): SharedSoundInfo => {
    const { key, asset } = soundOf(sound.key);
    return { key, frames: sound.frames, gainDb: wireDb(sound.gainDb), ...(sound.loop && { loop: sound.loop }), ...(asset && { asset }), ...(sound.growing && { growing: true as const }) };
  };
  const play = ({ startAt, gainDb, muted, reverb, fade }: MusicPlay | LayerPlay): Pick<SharedMusicPlay, 'startAt' | 'gainDb' | 'fade' | 'reverb'> & { muted?: boolean } => ({ startAt, gainDb: wireDb(gainDb), fade, ...(muted && { muted }), ...(reverb && { reverb }) });
  const music = (list: MusicPlay): SharedMusicPlay => ({ ...play(list), tracks: list.tracks.slice(0, MAX_SOUND_TRACKS).map(info), seed: list.seed, shuffle: list.shuffle, ...(list.repeat && { repeat: list.repeat }), ...(list.listFrame && { listFrame: list.listFrame }) });
  const layer = (entry: LayerPlay): SharedLayerPlay => ({ ...play(entry), sound: info(entry.sound) });
  return {
    revision: state.revision,
    silenced: state.silenced,
    silenceFade: state.silenceFade,
    music: state.music ? music(state.music) : null,
    outgoing: state.outgoing.slice(-MAX_SOUND_OUTGOING).map(music),
    layers: state.layers.slice(0, MAX_SOUND_LAYERS).map(layer),
    outgoingLayers: state.outgoingLayers.slice(-MAX_SOUND_OUTGOING).map(layer),
    ...(state.room && { room: state.room }),
  };
}
