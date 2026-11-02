import { FRAMES_PER_MS } from '../sound/engine/soundMath';
import { frameInSpan, framesToWrap, listOrder, loopRangeOf, musicSpanAt, playFrameAt } from '../sound/engine/soundTimeline';
import type { MusicPlay, SoundInfo, TableSound } from '../sound/soundTypes';
import { changed, leaving, OFFLINE_LEAD_MS, SEEK_FADE_MS, SKIP_FADE_MS, TRACK_JOIN_MS, withoutFinished } from './tableSound';

export interface MusicPosition {
  track: SoundInfo;
  /** Frames into the track, and how many it has. */
  frame: number;
  frames: number;
  /** What follows it; null where it goes round by itself. */
  next: SoundInfo | null;
  /** Table time at which the track ends or goes round. */
  endsAt: number;
}

/** Where a list is at `now`: the one read of it the row, the status bar and a skip share. */
export function musicPosition(play: MusicPlay, now: number): MusicPosition | null {
  const playFrame = playFrameAt(play.startAt, now);
  const span = musicSpanAt(play, playFrame);
  if (!span) return null;
  const frame = frameInSpan(span, Math.max(0, playFrame));
  const after = span.endPlayFrame === null ? null : musicSpanAt(play, span.endPlayFrame);
  const start = Math.max(now, play.startAt);
  return {
    track: span.sound,
    frame,
    frames: span.loop ? loopRangeOf(span.sound).endFrame : span.sound.frames,
    next: after?.sound ?? null,
    endsAt: start + framesToWrap(span, frame) / FRAMES_PER_MS,
  };
}

/** The list that sounds now: a play that takes over at a track's end has not begun until then. */
export function soundingMusic(state: TableSound, now: number): MusicPlay | null {
  if (state.music && state.music.startAt <= now) return state.music;
  return state.outgoing.findLast((play) => play.fade.at > now) ?? state.music;
}

/** The track that sounds now. */
export function soundingTrack(state: TableSound, now: number): SoundInfo | null {
  const play = soundingMusic(state, now);
  return (play && musicPosition(play, now)?.track) ?? null;
}

/** A seed whose shuffled order begins with `key`, from `seed` on. */
function seedBeginningWith(tracks: readonly SoundInfo[], key: string, seed: number): number {
  const limit = 64 * tracks.length;
  for (let offset = 0; offset < limit; offset++) {
    const order = listOrder(tracks.length, seed + offset, true, 0);
    if (tracks[order[0] ?? 0]?.key === key) return seed + offset;
  }
  return seed;
}

function seedNotBeginningWith(tracks: readonly SoundInfo[], key: string, seed: number): number {
  for (let offset = 0; offset < 64; offset++) {
    const order = listOrder(tracks.length, seed + offset, true, 0);
    if (tracks[order[0] ?? 0]?.key !== key) return seed + offset;
  }
  return seed;
}

/** The list going round from `from` on, which keeps its order and puts that track first. */
function rotatedFrom(tracks: readonly SoundInfo[], from: number): SoundInfo[] {
  return [...tracks.slice(from), ...tracks.slice(0, from)];
}

/** What a list becomes once its current track has ended: a change never cuts a track. */
export interface ListChange {
  tracks: SoundInfo[];
  shuffle: boolean;
  /** The track to follow the one sounding, whatever a shuffled order says. */
  next?: string;
}

/** A track of the list now, on a short crossfade; the list goes on from it, and a change waiting for the track's end is taken in. */
export function playTrack(state: TableSound, key: string, now: number, leadMs = OFFLINE_LEAD_MS, list?: ListChange | null): TableSound {
  const play = soundingMusic(state, now);
  const from = list ?? play;
  const index = from?.tracks.findIndex((track) => track.key === key) ?? -1;
  if (!play || !from || index < 0) return state;
  const live = withoutFinished(state, now);
  const startAt = now + leadMs;
  const tracks = from.shuffle ? from.tracks : rotatedFrom(from.tracks, index);
  const seed = from.shuffle ? seedBeginningWith(from.tracks, key, play.seed + 1) : play.seed;
  return changed(live, {
    music: { ...play, tracks, seed, shuffle: from.shuffle, startAt, fade: { at: startAt, ms: SKIP_FADE_MS } },
    outgoing: [...live.outgoing.filter((other) => other !== play), leaving(play, startAt, SKIP_FADE_MS)],
  });
}

/**
 * The track sounding now from `frame` on, at once, and the list goes on from there. The play is one that began as long ago as
 * that takes, so a page takes it as it takes a late join: in its place wherever the state reaches it, with no lead to wait for.
 */
export function seekMusic(state: TableSound, frame: number, now: number): TableSound {
  const play = state.music;
  const span = play && play.startAt <= now ? musicSpanAt(play, playFrameAt(play.startAt, now)) : null;
  if (!play || !span) return state;
  const frames = span.loop ? loopRangeOf(span.sound).endFrame : span.sound.frames;
  const startAt = now - (span.startPlayFrame + Math.max(0, Math.min(frames - 1, Math.round(frame)))) / FRAMES_PER_MS;
  const live = withoutFinished(state, now);
  return changed(live, {
    music: { ...play, startAt, fade: { at: startAt, ms: 0 } },
    outgoing: [...live.outgoing.filter((other) => other !== play), leaving(play, now, SEEK_FADE_MS)],
  });
}

/** What follows the track sounding now, a change waiting for its end included. */
export function nextTrack(state: TableSound, now: number, list?: ListChange | null): SoundInfo | null {
  const play = soundingMusic(state, now);
  const position = play && musicPosition(play, now);
  if (!position) return null;
  if (!list) return position.next;
  const changedList = withListChange(state, list, position.endsAt).music;
  return changedList && musicPosition(changedList, position.endsAt)?.track || null;
}

/** On to what the row names as next. Nothing to skip to on a single track. */
export function skipTrack(state: TableSound, now: number, leadMs = OFFLINE_LEAD_MS, list?: ListChange | null): TableSound {
  const next = nextTrack(state, now, list);
  return next ? playTrack(state, next.key, now, leadMs, list) : state;
}

/** When a list's change takes over. */
export function listChangeAt(state: TableSound, now: number): number | null {
  const play = state.music;
  return play ? (musicPosition(play, now)?.endsAt ?? null) : null;
}

/**
 * Takes a changed list in at `at`, a track's end, with what the old list was sounding gone by then. An
 * ordered list goes on after the track that just ended; a shuffled one does not begin with it again.
 */
export function withListChange(state: TableSound, change: ListChange, at: number): TableSound {
  const play = state.music;
  const ending = play && musicPosition(play, at - 1)?.track;
  if (!play || !ending || change.tracks.length === 0) return state;
  const index = change.tracks.findIndex((track) => track.key === ending.key);
  const tracks = change.shuffle || index < 0 ? change.tracks : rotatedFrom(change.tracks, index + 1);
  const seed = !change.shuffle ? play.seed
    : change.next !== undefined ? seedBeginningWith(tracks, change.next, play.seed + 1)
      : seedNotBeginningWith(tracks, ending.key, play.seed + 1);
  const live = withoutFinished(state, at);
  return changed(live, {
    music: { ...play, tracks, seed, shuffle: change.shuffle, startAt: at, fade: { at, ms: TRACK_JOIN_MS } },
    outgoing: [...live.outgoing, leaving(play, at, TRACK_JOIN_MS)],
  });
}
