import type { LayerPlay, MusicPlay, SoundInfo } from '../soundTypes';
import { FRAMES_PER_MS } from './soundMath';

export interface LoopRange {
  startFrame: number;
  endFrame: number;
}

/**
 * A stretch of a play that one sound fills. A layer and a list of one track have a single endless
 * span; each track of a longer list has a span of its own length.
 */
export interface TimelineSpan {
  sound: SoundInfo;
  /** Play frame (frames since the play's `startAt`) at which the span begins. */
  startPlayFrame: number;
  /** Null: never ends. */
  endPlayFrame: number | null;
  /** The range it goes round; null plays through once. */
  loop: LoopRange | null;
}

export function playFrameAt(startAt: number, tableMs: number): number {
  return Math.floor((tableMs - startAt) * FRAMES_PER_MS);
}

/** The sound's loop range, or the whole sound where it names none or a range that cannot be played. */
export function loopRangeOf(sound: SoundInfo): LoopRange {
  const loop = sound.loop;
  if (loop && Number.isInteger(loop.startFrame) && Number.isInteger(loop.endFrame) && loop.startFrame >= 0 && loop.startFrame < loop.endFrame && loop.endFrame <= sound.frames) {
    return loop;
  }
  return { startFrame: 0, endFrame: sound.frames };
}

/** The sound's own frame that a span holds at `playFrame`. */
export function frameInSpan(span: TimelineSpan, playFrame: number): number {
  const elapsed = playFrame - span.startPlayFrame;
  if (elapsed <= 0) return 0;
  const loop = span.loop;
  if (!loop || elapsed < loop.endFrame) return elapsed;
  return loop.startFrame + ((elapsed - loop.startFrame) % (loop.endFrame - loop.startFrame));
}

/** Frames from a sound's frame up to where it stops or wraps. */
export function framesToWrap(span: TimelineSpan, frame: number): number {
  return (span.loop ? span.loop.endFrame : span.sound.frames) - frame;
}

/** A small seeded generator: the same seed gives every client the same numbers. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const random = mulberry32(seed);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = swap;
  }
  return order;
}

function passSeed(seed: number, pass: number): number {
  return Math.imul(seed ^ pass, 0x9e3779b1) ^ (pass * 0x85ebca6b);
}

/**
 * The order of a list's tracks in one pass through it. Each pass of a shuffled list has its own
 * order, and never begins with the track the last pass ended on: where the two meet, the first two
 * trade places, which leaves the pass's own last track alone from three tracks up. Two tracks can
 * only alternate, so they keep one order.
 */
export function listOrder(count: number, seed: number, shuffle: boolean, pass: number): number[] {
  if (!shuffle || count < 2) return Array.from({ length: count }, (_, index) => index);
  if (count === 2) return shuffled(2, seed);
  const order = shuffled(count, passSeed(seed, pass));
  if (pass > 0 && order[0] === shuffled(count, passSeed(seed, pass - 1))[count - 1]) {
    const second = order[1] ?? 0;
    order[1] = order[0] ?? 0;
    order[0] = second;
  }
  return order;
}

/** One pass through a list, in the order it really plays, and the frame of the list it begins on. */
export interface ListPass {
  tracks: SoundInfo[];
  startFrame: number;
  frames: number;
}

/** The pass a frame of the list lies in. */
export function passAt(play: MusicPlay, listFrame: number): ListPass | null {
  const tracks = play.tracks.filter((track) => track.frames > 0);
  if (tracks.length === 0) return null;
  const frames = tracks.reduce((sum, track) => sum + track.frames, 0);
  const pass = Math.floor(listFrame / frames);
  const ordered = listOrder(tracks.length, play.seed, play.shuffle, pass).flatMap((index) => tracks[index] ?? []);
  return { tracks: ordered, startFrame: pass * frames, frames };
}

/** The frame of the list `playFrame` stands at. A track held for good stays where it was taken up. */
export function listFrameAt(play: MusicPlay, playFrame: number): number {
  const taken = play.listFrame ?? 0;
  return play.repeat === 'one' ? taken : taken + Math.max(0, playFrame);
}

function spanInPass(pass: ListPass, listFrame: number, taken: number): TimelineSpan | null {
  let start = pass.startFrame;
  for (const track of pass.tracks) {
    if (listFrame < start + track.frames) return { sound: track, startPlayFrame: start - taken, endPlayFrame: start + track.frames - taken, loop: null };
    start += track.frames;
  }
  return null;
}

/** The span of a music list at `playFrame`, which may lie before the list began (its first track). Past the end of a list that stops there is nothing. */
export function musicSpanAt(play: MusicPlay, playFrame: number): TimelineSpan | null {
  const taken = play.listFrame ?? 0;
  const firstPass = passAt(play, taken);
  if (!firstPass) return null;
  if (play.repeat === 'one' || (firstPass.tracks.length === 1 && play.repeat !== 'off')) {
    const held = spanInPass(firstPass, taken, taken)?.sound ?? firstPass.tracks[0];
    return held ? { sound: held, startPlayFrame: 0, endPlayFrame: null, loop: loopRangeOf(held) } : null;
  }
  const frame = listFrameAt(play, playFrame);
  if (play.repeat === 'off') return frame < firstPass.startFrame + firstPass.frames ? spanInPass(firstPass, frame, taken) : null;
  const pass = passAt(play, frame);
  return pass && spanInPass(pass, frame, taken);
}

export function layerSpan(play: LayerPlay): TimelineSpan | null {
  const sound = play.sound;
  if (sound.frames <= 0) return null;
  return { sound, startPlayFrame: 0, endPlayFrame: null, loop: loopRangeOf(sound) };
}
