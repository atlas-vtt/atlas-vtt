import { SOUND_RATE } from '../sound/engine/soundMath';

/**
 * Loop points the GM sets on a track (`SoundRecord.loop`): where it goes round between once it plays on its
 * own, crossfaded at the seam (`soundDirector/loopSeam.ts`). Frames at 48 kHz of the track's copy.
 */
export interface LoopPoints {
  startFrame: number;
  endFrame: number;
}

/** The shortest loop: shorter, a crossfade would be all there is of it. */
export const MIN_LOOP_FRAMES = SOUND_RATE;

const frameOf = (frame: number, frames: number): number => Math.max(0, Math.min(frames, Math.round(frame)));

/** The loop with its in at `frame`; its out stays, or is the track's end where none was set or it would fall too close. */
export function withLoopIn(loop: LoopPoints | undefined, frame: number, frames: number): LoopPoints | null {
  const startFrame = frameOf(frame, frames);
  const kept = loop && loop.endFrame - startFrame >= MIN_LOOP_FRAMES ? loop.endFrame : frames;
  return kept - startFrame >= MIN_LOOP_FRAMES ? { startFrame, endFrame: kept } : null;
}

/** The loop with its out at `frame`; its in stays, or is the track's start where none was set or it would fall too close. */
export function withLoopOut(loop: LoopPoints | undefined, frame: number, frames: number): LoopPoints | null {
  const endFrame = frameOf(frame, frames);
  const kept = loop && endFrame - loop.startFrame >= MIN_LOOP_FRAMES ? loop.startFrame : 0;
  return endFrame - kept >= MIN_LOOP_FRAMES ? { startFrame: kept, endFrame } : null;
}

/** A place in a track to a tenth of a second: `1:05.3`. */
export function loopClock(frame: number): string {
  const tenths = Math.max(0, Math.round((frame / SOUND_RATE) * 10));
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${tenths % 10}`;
}

export function loopText(loop: LoopPoints): string {
  return `${loopClock(loop.startFrame)} – ${loopClock(loop.endFrame)}`;
}

/** `m:ss.s`, `ss.s` or `h:mm:ss`, in frames; null for anything else. */
function parseClock(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length > 3 || parts.some((part) => !/^\d+(?:[.,]\d+)?$/.test(part))) return null;
  const seconds = parts.reduce((sum, part) => sum * 60 + Number(part.replace(',', '.')), 0);
  return Number.isFinite(seconds) ? Math.round(seconds * SOUND_RATE) : null;
}

/**
 * Loop points as the GM types them, `0:10 – 0:40` (any dash, or `to`), within a track of `frames`: null clears them,
 * `invalid` is text that names no loop of at least `MIN_LOOP_FRAMES` inside the track.
 */
export function parseLoopText(text: string, frames: number): LoopPoints | null | 'invalid' {
  if (text.trim() === '') return null;
  const ends = text.split(/\s*(?:[-–—]|to)\s*/i).filter((part) => part !== '');
  if (ends.length !== 2) return 'invalid';
  const [startFrame, endFrame] = ends.map(parseClock);
  if (startFrame === null || endFrame === null || startFrame === undefined || endFrame === undefined) return 'invalid';
  return endFrame <= frames && endFrame - startFrame >= MIN_LOOP_FRAMES ? { startFrame, endFrame } : 'invalid';
}
