import type { SoundInfo } from '../sound/soundTypes';
import { changeOf } from './listPlace';
import { musicPosition, playTrack, soundingMusic, soundingTrack } from './musicList';
import { fnv1a32 } from '../utils/hashing';
import { startMusic } from './liveEdits';
import type { MixTiming, SoundMix } from './soundMix';
import type { ReadySounds } from './tableSound';

/** Tracks the GM wants sooner than the end of the list, in the order they were selected: placed as their copies come, each after the one before. */
export interface SoonestTracks {
  /** Record ids still to be placed. */
  sounds: string[];
  at: 'now' | 'next';
  /** The key of the one placed last, which the next follows. */
  after?: string;
}

const keyAt = (mix: SoundMix, now: number): string | null => soundingTrack(mix.table, now)?.key ?? null;

/** The list with `group` right after `anchor`, moved there where it is on the list already. */
function withTracksAfter(tracks: readonly SoundInfo[], group: readonly SoundInfo[], anchor: string | null): SoundInfo[] {
  const keys = new Set(group.map((track) => track.key));
  const rest = tracks.filter((other) => !keys.has(other.key));
  const at = rest.findIndex((other) => other.key === anchor);
  return [...rest.slice(0, at + 1), ...group, ...rest.slice(at + 1)];
}

function startList(mix: SoundMix, tracks: readonly SoundInfo[], levelDb: number, { now, leadMs, fadeMs }: MixTiming): SoundMix {
  return { ...mix, table: startMusic(mix.table, [...tracks], false, levelDb, fnv1a32(`${now}`), now, fadeMs, leadMs) };
}

/** Tracks follow the one sounding, or the one named, in their order: they join at that track's end and never cut it. On a shuffled list too, for the first of them. Without music they start. */
export function playNext(mix: SoundMix, tracks: readonly SoundInfo[], levelDb: number, timing: MixTiming, after?: string): SoundMix {
  if (!mix.table.music) return tracks.length > 0 ? startList(mix, tracks, levelDb, timing) : mix;
  const soundingKey = keyAt(mix, timing.now);
  const group = tracks.filter((track) => track.key !== soundingKey);
  const [first] = group;
  if (!first) return mix;
  const base = mix.listChange ?? mix.table.music;
  const follows = after !== undefined && base.tracks.some((track) => track.key === after) ? after : soundingKey;
  const next = follows === soundingKey ? first.key : mix.listChange?.next;
  return { ...mix, listChange: changeOf(base, withTracksAfter(base.tracks, group, follows), next) };
}

/**
 * The first of the tracks plays now on the default fade, and the list goes on from it through the rest. Tracks from elsewhere take the
 * place of the one playing, so choosing track after track leaves no trail of them on the list; one on the list is only gone to. Without music they start.
 */
export function playNow(mix: SoundMix, tracks: readonly SoundInfo[], levelDb: number, timing: MixTiming): SoundMix {
  const [first] = tracks;
  if (!first) return mix;
  if (!mix.table.music) return startList(mix, tracks, levelDb, timing);
  const soundingKey = keyAt(mix, timing.now);
  if (first.key === soundingKey) return playNext(mix, tracks, levelDb, timing);
  const base = mix.listChange ?? mix.table.music;
  const onList = tracks.some((track) => base.tracks.some((other) => other.key === track.key));
  // A play still in its lead is what this replaces, though the one before it sounds until then.
  const current = musicPosition(mix.table.music, timing.now)?.track.key;
  const replaced = base.tracks.findIndex((track) => track.key === current);
  const list = onList || replaced < 0 ? withTracksAfter(base.tracks, tracks, soundingKey) : [...base.tracks.slice(0, replaced), ...tracks, ...base.tracks.slice(replaced + 1)];
  return { ...mix, table: playTrack(mix.table, first.key, timing.now, timing.leadMs, changeOf(base, list), timing.fadeMs), listChange: null };
}

/** How many of the selection, from its first on, have their copies. */
function readyRun(sounds: readonly string[], ready: ReadySounds): number {
  const at = sounds.findIndex((id) => !ready.has(id));
  return at < 0 ? sounds.length : at;
}

/** What may join the list now: where nothing plays yet the selection's first must begin it, so what lies behind one still to come stays back. */
export function readyToJoin(mix: SoundMix, ready: ReadySounds): ReadySounds {
  const { soonest } = mix;
  if (!soonest || mix.table.music) return ready;
  const behind = new Set(soonest.sounds.slice(readyRun(soonest.sounds, ready)));
  return behind.size === 0 ? ready : new Map([...ready].filter(([id]) => !behind.has(id)));
}

/** What waited for its copy to play sooner than the rest: the copies here, from the selection's first on, go where they were asked to. */
export function applySoonest(mix: SoundMix, ready: ReadySounds, timing: MixTiming): SoundMix {
  const { soonest } = mix;
  if (!soonest) return mix;
  const placed = soonest.sounds.slice(0, readyRun(soonest.sounds, ready)).flatMap((id) => ready.get(id) ?? []);
  const last = placed.at(-1);
  if (!last) return mix;
  const levelDb = mix.table.music?.gainDb ?? 0;
  const { soonest: _taken, ...without } = mix;
  const applied = soonest.at === 'now' ? playNow(without, placed, levelDb, timing) : playNext(without, placed, levelDb, timing, soonest.after);
  const sounds = soonest.sounds.slice(placed.length);
  return sounds.length > 0 ? { ...applied, soonest: { sounds, at: 'next', after: last.key } } : applied;
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
  const list = mix.listChange ?? mix.table.music ?? soundingMusic(mix.table, now);
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
