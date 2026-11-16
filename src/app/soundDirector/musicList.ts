import { FRAMES_PER_MS } from '../sound/engine/soundMath';
import { frameInSpan, framesToWrap, listFrameAt, musicSpanAt, passAt, playFrameAt, type ListPass } from '../sound/engine/soundTimeline';
import type { MusicPlay, SoundInfo, TableSound } from '../sound/soundTypes';
import { joinFadeMs, playAtPlace, placeAfter, placeOf, sameOrder, type ListChange, type ListPlace } from './listPlace';
import { changed, leaving, OFFLINE_LEAD_MS, SEEK_FADE_MS, SKIP_FADE_MS, TRACK_JOIN_MS, withoutFinished } from './tableSound';

export type { ListChange } from './listPlace';

/** In a track's first moments Back goes to the track before; later it starts this one again. */
export const BACK_TO_PREVIOUS_MS = 3000;

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
    frames: framesToWrap(span, 0),
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

/** A track of the list now, on a crossfade; the list goes on from it, and a change waiting for the track's end is taken in. */
export function playTrack(state: TableSound, key: string, now: number, leadMs = OFFLINE_LEAD_MS, list?: ListChange | null, fadeMs = SKIP_FADE_MS): TableSound {
  const play = soundingMusic(state, now);
  const listPlace = play && placeOf(play, list ?? null, key, now);
  if (!play || !listPlace) return state;
  const live = withoutFinished(state, now);
  const startAt = now + leadMs;
  return changed(live, {
    music: playAtPlace(play, listPlace, startAt, fadeMs),
    outgoing: [...live.outgoing.filter((other) => other !== play), leaving(play, startAt, fadeMs)],
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
  const startAt = now - (span.startPlayFrame + Math.max(0, Math.min(framesToWrap(span, 0) - 1, Math.round(frame)))) / FRAMES_PER_MS;
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

/** What the list holds around the track sounding, in the order it plays: where a press of Skip or Back goes. */
function neighbour(state: TableSound, now: number, list: ListChange | null | undefined, step: 1 | -1): SoundInfo | null {
  const { tracks, current } = listView(state, list, now);
  const at = tracks.findIndex((track) => track.key === current);
  const stopsAtEnds = (list ?? state.music)?.repeat === 'off';
  if (at < 0 || tracks.length < 2 || (stopsAtEnds && !tracks[at + step])) return null;
  return tracks[(at + step + tracks.length) % tracks.length] ?? null;
}

/** On to what the row names as next, or under a track held for good the next on the list, which is then held. The end of a list that stops there ends the music. */
export function skipTrack(state: TableSound, now: number, leadMs = OFFLINE_LEAD_MS, list?: ListChange | null): TableSound {
  const { music } = state;
  const going = list ?? music;
  if (!music || !going) return state;
  const next = going.repeat === 'one' ? neighbour(state, now, list, 1) : nextTrack(state, now, list);
  if (next) return playTrack(state, next.key, now, leadMs, list);
  if (going.repeat !== 'off') return state;
  const live = withoutFinished(state, now);
  return changed(live, { music: null, outgoing: [...live.outgoing, leaving(music, now, SKIP_FADE_MS)] });
}

/** Where Back goes early in a track, in the order the list plays; null where it starts this one again, as it always does later on, and on a list of one. */
export function previousTrack(state: TableSound, now: number, list?: ListChange | null): SoundInfo | null {
  const play = soundingMusic(state, now);
  const position = play && musicPosition(play, now);
  return position && position.frame < BACK_TO_PREVIOUS_MS * FRAMES_PER_MS ? neighbour(state, now, list, -1) : null;
}

/** What `listPlace` names starts at `startAt` as `play` leaves, both over `fadeMs`; with no place the music just ends there. */
export function handOver(state: TableSound, play: MusicPlay, listPlace: ListPlace | null, startAt: number, fadeMs: number): TableSound {
  const live = withoutFinished(state, startAt);
  return changed(live, {
    music: listPlace && playAtPlace(play, listPlace, startAt, fadeMs),
    outgoing: [...live.outgoing, leaving(play, startAt, fadeMs)],
  });
}

/**
 * Takes a changed list in at `at`, a track's end, with what comes starting and what ends leaving `fadeMs` before it, so what
 * ends is gone by then and never reaches what its own timeline had next. A list that has run out just ends there.
 */
export function withListChange(state: TableSound, change: ListChange, at: number, fadeMs = TRACK_JOIN_MS): TableSound {
  const play = state.music;
  const span = play && musicSpanAt(play, playFrameAt(play.startAt, at - 1));
  if (!play || !span || change.tracks.length === 0) return state;
  return handOver(state, play, placeAfter(play, change, span), at - fadeMs, fadeMs);
}

/** What the card's list shows: a pass in the order it really plays, what plays in it, and what remains. */
export interface ListView {
  tracks: readonly SoundInfo[];
  current: string | null;
  /** Frames left of the list; of this pass where it goes round, of this track where it stays on one. */
  leftFrames: number;
}

const NO_TRACKS: readonly SoundInfo[] = [];

/** The pass to show: the one under way, or with a change waiting the one that change will make, so the list shows it at once. */
function shownPass(state: TableSound, play: MusicPlay, list: ListChange | null | undefined, now: number): ListPass | null {
  const { music } = state;
  if (list && music && !sameOrder(music, list)) {
    const span = musicSpanAt(music, playFrameAt(music.startAt, now));
    const listPlace = span && placeAfter(music, list, span);
    return passAt(playAtPlace(music, listPlace ?? { tracks: list.tracks, seed: music.seed, shuffle: list.shuffle }, 0, 0), 0);
  }
  return passAt(play, listFrameAt(play, playFrameAt(play.startAt, now)));
}

export function listView(state: TableSound, list: ListChange | null | undefined, now: number, crossfadeMs = 0): ListView {
  const play = soundingMusic(state, now);
  const position = play && musicPosition(play, now);
  const pass = play && shownPass(state, play, list, now);
  const going = list ?? play;
  if (!position || !pass) return { tracks: going?.tracks ?? NO_TRACKS, current: null, leftFrames: 0 };
  let leftFrames = position.frames - position.frame;
  if (going?.repeat === 'one' || pass.tracks.length === 1) return { tracks: pass.tracks, current: position.track.key, leftFrames };
  const at = pass.tracks.findIndex((track) => track.key === position.track.key);
  for (let index = at + 1; index < pass.tracks.length; index++) {
    const track = pass.tracks[index];
    const before = pass.tracks[index - 1];
    if (!track || !before) continue;
    leftFrames += track.frames - joinFadeMs(before, track, crossfadeMs) * FRAMES_PER_MS;
  }
  return { tracks: pass.tracks, current: position.track.key, leftFrames: Math.max(0, leftFrames) };
}
