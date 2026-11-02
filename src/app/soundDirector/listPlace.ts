import { FRAMES_PER_MS } from '../sound/engine/soundMath';
import { listFrameAt, listOrder, passAt, playFrameAt, type TimelineSpan } from '../sound/engine/soundTimeline';
import type { MusicPlay, MusicRepeat, SoundInfo } from '../sound/soundTypes';

/** What a list becomes once its current track has ended: a change never cuts a track. */
export interface ListChange {
  tracks: SoundInfo[];
  shuffle: boolean;
  repeat?: MusicRepeat;
  /** The track to follow the one sounding, whatever a shuffled order says. */
  next?: string;
}

/** A list and where in it a play takes it up: the fields of a play that say what comes. */
export type ListPlace = Pick<MusicPlay, 'tracks' | 'seed' | 'shuffle' | 'repeat' | 'listFrame'>;

/** A list with new tracks that keeps how it goes on. */
export function changeOf(base: { shuffle: boolean; repeat?: MusicRepeat | undefined }, tracks: SoundInfo[], next?: string): ListChange {
  return { tracks, shuffle: base.shuffle, ...(base.repeat && { repeat: base.repeat }), ...(next !== undefined && { next }) };
}

/** Whether a play already goes through a list in that order, so what changes is at most how it ends. */
export function sameOrder(play: MusicPlay, list: Pick<ListChange, 'tracks' | 'shuffle' | 'next'>): boolean {
  return play.shuffle === list.shuffle && list.next === undefined && play.tracks.length === list.tracks.length && play.tracks.every((track, index) => track.key === list.tracks[index]?.key);
}

function place(list: { tracks: SoundInfo[]; shuffle: boolean; repeat?: MusicRepeat }, seed: number, listFrame: number): ListPlace {
  return { tracks: list.tracks, seed, shuffle: list.shuffle, ...(list.repeat && { repeat: list.repeat }), ...(listFrame > 0 && { listFrame }) };
}

const framesBefore = (tracks: readonly SoundInfo[], index: number): number => tracks.slice(0, Math.max(0, index)).reduce((sum, track) => sum + track.frames, 0);

/** A seed whose shuffled order begins with `key`, from `seed` on. */
function seedBeginningWith(tracks: readonly SoundInfo[], key: string, seed: number): number {
  const limit = 64 * tracks.length;
  for (let offset = 0; offset < limit; offset++) {
    const order = listOrder(tracks.length, seed + offset, true, 0);
    if (tracks[order[0] ?? 0]?.key === key) return seed + offset;
  }
  return seed;
}

/** The list with `next` where a shuffled order takes its second track from: one swap, so the list's own order stays what it was but for that. */
function withFollower(tracks: SoundInfo[], seed: number, next: string | undefined): SoundInfo[] {
  if (next === undefined) return tracks;
  const [first, second] = listOrder(tracks.length, seed, true, 0);
  const from = tracks.findIndex((track) => track.key === next);
  if (second === undefined || from < 0 || from === first) return tracks;
  const swapped = [...tracks];
  const follower = tracks[from];
  const displaced = tracks[second];
  if (!follower || !displaced) return tracks;
  swapped[second] = follower;
  swapped[from] = displaced;
  return swapped;
}

/** What goes on from once the track `span` holds ends, with `change` taken in: null where the list has run out. */
export function placeAfter(play: MusicPlay, change: ListChange | null, span: TimelineSpan): ListPlace | null {
  const list = change ?? play;
  const ending = span.sound;
  if (sameOrder(play, list)) {
    const start = (play.listFrame ?? 0) + span.startPlayFrame;
    const end = start + ending.frames;
    if (list.repeat === 'one') return place(list, play.seed, start);
    const pass = passAt(play, start);
    if (list.repeat === 'off' && (!pass || end >= pass.startFrame + pass.frames)) return null;
    return place(list, play.seed, end);
  }
  const index = list.tracks.findIndex((track) => track.key === ending.key);
  const next = 'next' in list ? list.next : undefined;
  if (!list.shuffle) {
    if (list.repeat === 'one') return place(list, play.seed, framesBefore(list.tracks, index));
    const following = index + 1;
    if (following < list.tracks.length) return place(list, play.seed, framesBefore(list.tracks, following));
    return list.repeat === 'off' ? null : place(list, play.seed, 0);
  }
  if (index < 0) return place(list, next === undefined ? play.seed + 1 : seedBeginningWith(list.tracks, next, play.seed + 1), 0);
  // The track that ends comes first in the new order and is taken as played, so a new order never plays it again at once and shows it where it stands.
  const seed = seedBeginningWith(list.tracks, ending.key, play.seed + 1);
  const tracks = withFollower(list.tracks, seed, next);
  if (list.repeat === 'one') return place({ ...list, tracks }, seed, 0);
  if (list.repeat === 'off' && tracks.length === 1) return null;
  return place({ ...list, tracks }, seed, tracks.length === 1 ? 0 : ending.frames);
}

/** Where `key` lies in the list, for a play that goes there now; null where it is not on it. */
export function placeOf(play: MusicPlay, change: ListChange | null, key: string, now: number): ListPlace | null {
  const list = change ?? play;
  if (!list.tracks.some((track) => track.key === key)) return null;
  if (sameOrder(play, list)) {
    const pass = passAt(play, listFrameAt(play, playFrameAt(play.startAt, now)));
    if (!pass) return null;
    return place(list, play.seed, pass.startFrame + framesBefore(pass.tracks, pass.tracks.findIndex((track) => track.key === key)));
  }
  if (!list.shuffle) return place(list, play.seed, framesBefore(list.tracks, list.tracks.findIndex((track) => track.key === key)));
  return place(list, seedBeginningWith(list.tracks, key, play.seed + 1), 0);
}

/** A play taking a list up at `listPlace`, coming in over `fadeMs`: its fade begins where it begins. */
export function playAtPlace({ repeat: _repeat, listFrame: _listFrame, ...play }: MusicPlay, listPlace: ListPlace, startAt: number, fadeMs: number): MusicPlay {
  return { ...play, ...listPlace, startAt, fade: { at: startAt, ms: fadeMs } };
}

/** How long two tracks of a list overlap: never over half of either, or a short track would be nothing but its fades. */
export function joinFadeMs(ending: SoundInfo, coming: SoundInfo, crossfadeMs: number): number {
  return ending.key === coming.key ? 0 : Math.min(crossfadeMs, Math.min(ending.frames, coming.frames) / FRAMES_PER_MS / 2);
}
