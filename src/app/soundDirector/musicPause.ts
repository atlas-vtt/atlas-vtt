import type { MusicPlay } from '../sound/soundTypes';
import { stopMusic, toggleSilence } from './liveEdits';
import type { SoundMix } from './soundMix';
import { changed, SEEK_FADE_MS, SILENCE_FADE_MS, withoutFinished } from './tableSound';

/**
 * Music the GM paused: the play as it stood and the table time it stopped at. It is the GM's alone, never on
 * the wire: for the table the music has stopped, and resuming starts it again where it was, as a seek does.
 */
export interface PausedMusic {
  play: MusicPlay;
  at: number;
  /** Held by Stop all: Bring back starts it again with the rest. */
  byStop?: true;
}

/** Short, as a seek's: a pause is heard at once, and a resume picks up where it stopped. */
export const PAUSE_FADE_MS = SEEK_FADE_MS;

/** The music the card shows: what plays, else what is paused. */
export function shownMusic(mix: SoundMix): MusicPlay | null {
  return mix.table.music ?? mix.paused?.play ?? null;
}

/** Stops the music at its position; the ambience plays on. A list not begun yet has no position to keep. */
export function pauseMusic(mix: SoundMix, now: number): SoundMix {
  const play = mix.table.music;
  if (!play || mix.paused || play.startAt > now) return mix;
  return { ...mix, table: stopMusic(mix.table, now, PAUSE_FADE_MS), paused: { play, at: now } };
}

/** The paused music again from where it stopped: the list began as much later as it was paused. */
export function resumeMusic(mix: SoundMix, now: number): SoundMix {
  const { paused, ...rest } = mix;
  if (!paused || mix.table.music) return mix;
  const startAt = paused.play.startAt + (now - paused.at);
  return { ...rest, table: changed(withoutFinished(mix.table, now), { music: { ...paused.play, startAt, fade: { at: startAt, ms: 0 } } }) };
}

/**
 * Stop all: the whole table fades out and the music's clock holds where it is, so Bring back starts it from
 * there. Music paused already stays paused; a list not begun yet has no position to keep and starts unheard.
 */
export function stopEverything(mix: SoundMix, now: number): SoundMix {
  if (mix.table.silenced) return mix;
  const stopped = { ...mix, table: toggleSilence(mix.table, now) };
  const play = stopped.table.music;
  if (!play || mix.paused || play.startAt > now) return stopped;
  return { ...stopped, table: stopMusic(stopped.table, now, SILENCE_FADE_MS), paused: { play, at: now, byStop: true } };
}

/** Everything Stop all held, again: the music from where it stopped, faded in with the rest. */
export function bringBack(mix: SoundMix, now: number): SoundMix {
  if (!mix.table.silenced) return mix;
  const back = { ...mix, table: toggleSilence(mix.table, now) };
  if (!mix.paused?.byStop) return back;
  // What still fades out of the stop goes: the same track goes on from where it stopped.
  return resumeMusic({ ...back, table: changed(back.table, { outgoing: [] }) }, now);
}

/**
 * A pause holds only while no music plays: whatever starts music (a mood, a list, a track) ends it. Music
 * held by a stop that something else ended (a mood without music) stays paused, for the GM to resume.
 */
export function withPauseStillMeant(mix: SoundMix): SoundMix {
  if (!mix.paused) return mix;
  if (!mix.table.music) {
    if (!mix.paused.byStop || mix.table.silenced) return mix;
    const { byStop: _byStop, ...paused } = mix.paused;
    return { ...mix, paused };
  }
  const { paused: _paused, ...rest } = mix;
  return rest;
}

/** An edit of the music (level, reverb, mute) made while paused: it lands on the paused play, which resumes with it. */
export function editPausedMusic(mix: SoundMix, edit: (play: MusicPlay) => MusicPlay | null): SoundMix {
  if (!mix.paused) return mix;
  const play = edit(mix.paused.play);
  return play && play !== mix.paused.play ? { ...mix, paused: { ...mix.paused, play } } : mix;
}

/** As `onShiftedClock` for the table: the paused position stays where it was. */
export function pauseOnShiftedClock(paused: PausedMusic, deltaMs: number): PausedMusic {
  return { ...paused, play: { ...paused.play, startAt: paused.play.startAt + deltaMs, fade: { ...paused.play.fade, at: paused.play.fade.at + deltaMs } }, at: paused.at + deltaMs };
}
