export type Planes = Float32Array<ArrayBuffer>[];

/** 1 ms, in which a rise is looked for: short enough to place it, long enough for noise to average. */
const RISE_BLOCK = 48;
/** The level the sound has past the padding, read over 50 ms. */
const LEVEL_FRAMES = 2400;
/** A rise this steep, to a level this close to the sound's, out of a stretch this quiet, is where padding ends. */
const MIN_RISE = 10 ** (10 / 10);
const MIN_REACHED = 10 ** (-20 / 10);
const MIN_QUIET = 10 ** (12 / 10);
/**
 * Where a known encoder's priming would end, far less says the same: a stretch this much quieter than the 10 ms after
 * it. A fade of any length from silence comes to about 6 dB, and sound from its first frame to none.
 */
const MIN_HINT_QUIET = 10 ** (8 / 10);
const HINT_AHEAD_FRAMES = 480;
const NO_ENERGY = 1e-14;

/** A 2 ms window of the signal's second difference: what a click or a slip of phase splatters. */
const SPLATTER_FRAMES = 96;
const SPLATTER_HOP = 24;
/** The windows a wrap is held against lie this far from it, where nothing of it reaches. */
const NEAR_FRAMES = 240;
const ORDINARY_FRAMES = 1200;
/** A wrap's splatter may be this many times the largest of those windows'. */
const MAX_SPLATTER = 4;
/** Level at either end over 10 ms against the 20 ms behind it: a codec's ramp lasts that long, an attack does not. */
const END_FRAMES = 480;
const BEHIND_FRAMES = 960;
const MAX_END_DROP = 10 ** (-6 / 10);
/** A head this much louder than the tail begins on an attack, whose own splatter is what it is meant to have. */
const ONSET = 10 ** (6 / 10);

/** 30 ms, for a ramp, to lie over it: all a stream can hide under its pre-skip (`WRAP_INSET_FRAMES` in `loopEnds`). */
export const CROSSFADE_FRAMES = 1440;
/** 10 ms, for a click: nothing to hide but a moment, and what a crossfade takes out of a loop's length comes out of its rhythm. */
const SHORT_CROSSFADE_FRAMES = 480;
/** Of places about as good, the nearest: it takes the least away. */
const ALIGN_TOLERANCE = 0.002;
const WORTH_ALIGNING = 0.5;
/** 20 ms: a whole period of anything above 50 Hz, so a tone can always line up with itself. */
const ALIGN_FRAMES = 960;

export const LOOP_HOLD_FRAMES = LEVEL_FRAMES + BEHIND_FRAMES + ORDINARY_FRAMES + CROSSFADE_FRAMES + ALIGN_FRAMES;

export interface PaddingSearch {
  /** How far padding may reach at either end, in frames. */
  reach: number;
  /** Where the priming of the encoders that write most such files ends, in frames. */
  priming: readonly number[];
}

function frameCount(planes: readonly Float32Array[]): number {
  return planes[0]?.length ?? 0;
}

/**
 * How many frames at one end of a decoded file are only a codec's padding, where nothing says: 0 where it finds
 * none. A lossy encoder's priming and tail end in a rise within about a millisecond, since the signal starts
 * there and the block before it only held its pre-echo. A fade or a quiet lead-in rises slower or from too
 * little above it, so real sound stays.
 */
export function paddingAtEnd(planes: readonly Float32Array[], reach: number, fromEnd: boolean, priming: readonly number[] = []): number {
  const total = frameCount(planes);
  if (total < reach + LEVEL_FRAMES) return 0;
  const energy = new Float64Array(reach + LEVEL_FRAMES + 1);
  for (let i = 0; i < reach + LEVEL_FRAMES; i++) {
    const at = fromEnd ? total - 1 - i : i;
    let sum = 0;
    for (const plane of planes) sum += (plane[at] ?? 0) ** 2;
    energy[i + 1] = (energy[i] ?? 0) + sum;
  }
  const between = (from: number, to: number): number => ((energy[to] ?? 0) - (energy[from] ?? 0)) / (to - from);
  for (const hint of priming) {
    if (between(hint, hint + HINT_AHEAD_FRAMES) >= between(0, hint) * MIN_HINT_QUIET) return hint;
  }
  const level = between(reach, reach + LEVEL_FRAMES);
  let edge = 0;
  let steepest = MIN_RISE;
  for (let i = RISE_BLOCK; i + RISE_BLOCK <= reach; i++) {
    if (between(i, i + RISE_BLOCK) < level * MIN_REACHED) continue;
    const rise = between(i, i + RISE_BLOCK) / Math.max(between(i - RISE_BLOCK, i), NO_ENERGY);
    if (rise > steepest) {
      steepest = rise;
      edge = i;
    }
  }
  if (edge === 0) return 0;
  return between(edge, edge + RISE_BLOCK) / Math.max(between(0, edge), NO_ENERGY) >= MIN_QUIET ? edge : 0;
}

function energyOf(planes: readonly Float32Array[], from: number, to: number): number {
  let sum = 0;
  for (const plane of planes) for (let i = from; i < to; i++) sum += (plane[i] ?? 0) ** 2;
  return sum / Math.max(1, to - from);
}

/** The end of the tail and the start of the head as one signal, one array per channel. */
function acrossWrap(head: readonly Float32Array[], tail: readonly Float32Array[], frames: number): Float32Array[] {
  const tailEnd = frameCount(tail);
  return head.map((h, channel) => {
    const out = new Float32Array(2 * frames);
    out.set((tail[channel] ?? h).subarray(tailEnd - frames, tailEnd));
    out.set(h.subarray(0, frames), frames);
    return out;
  });
}

function splatterOf(planes: readonly Float32Array[], from: number): number {
  let sum = 0;
  for (const plane of planes) {
    for (let i = from; i < from + SPLATTER_FRAMES; i++) sum += ((plane[i + 1] ?? 0) - 2 * (plane[i] ?? 0) + (plane[i - 1] ?? 0)) ** 2;
  }
  return sum;
}

/** How the sound goes across its wrap. */
export type SeamState = 'continuous' | 'click' | 'ramp';

/**
 * Whether the sound goes on across the wrap as it goes on anywhere near it: no more splatter there, unless the
 * head begins on an attack, and no ramp of a codec's at either end. `head` starts at the sound's first frame,
 * `tail` ends at its last.
 */
export function seamState(head: readonly Float32Array[], tail: readonly Float32Array[]): SeamState {
  const frames = NEAR_FRAMES + ORDINARY_FRAMES;
  const tailEnd = frameCount(tail);
  if (frameCount(head) < frames || tailEnd < frames) return 'continuous';
  const headLevel = energyOf(head, 0, END_FRAMES);
  const tailLevel = energyOf(tail, tailEnd - END_FRAMES, tailEnd);
  // Lower than the sound on its own side and across the wrap: where both ends are low, a crossfade fills nothing.
  if (headLevel < Math.min(tailLevel, energyOf(head, END_FRAMES, END_FRAMES + BEHIND_FRAMES)) * MAX_END_DROP) return 'ramp';
  if (tailLevel < Math.min(headLevel, energyOf(tail, tailEnd - END_FRAMES - BEHIND_FRAMES, tailEnd - END_FRAMES)) * MAX_END_DROP) return 'ramp';
  if (headLevel >= tailLevel * ONSET) return 'continuous';
  const signal = acrossWrap(head, tail, frames);
  let ordinary = NO_ENERGY;
  for (let at = 1; at < ORDINARY_FRAMES - SPLATTER_FRAMES; at += SPLATTER_HOP) {
    ordinary = Math.max(ordinary, splatterOf(signal, at), splatterOf(signal, 2 * frames - at - SPLATTER_FRAMES - 1));
  }
  for (let at = frames - SPLATTER_FRAMES; at <= frames; at += SPLATTER_HOP) {
    if (splatterOf(signal, at) > ordinary * MAX_SPLATTER) return 'click';
  }
  return 'continuous';
}

export interface LoopCrossfade {
  /** Follows the tail past `lag`, in the place of its last `planes` frames; the sound's frame `planes` goes on from it. */
  planes: Planes;
  /** Frames at the very end of the tail left out, so that a tone lines up with itself. */
  lag: number;
}

interface Alignment {
  lag: number;
  correlation: number;
}

/** The place in the tail's last 20 ms that looks most like the head, over `frames`. */
function alignTail(head: readonly Float32Array[], tail: readonly Float32Array[], frames: number): Alignment {
  const tailEnd = frameCount(tail);
  const room = Math.min(ALIGN_FRAMES, tailEnd - frames);
  const headEnergy = energyOf(head, 0, frames) * frames;
  const scores: number[] = [];
  for (let lag = 0; lag < room; lag++) {
    const start = tailEnd - lag - frames;
    let product = 0;
    let energy = 0;
    for (let channel = 0; channel < head.length; channel++) {
      const h = head[channel];
      const t = tail[channel];
      if (!h || !t) continue;
      for (let i = 0; i < frames; i++) {
        const value = t[start + i] ?? 0;
        product += (h[i] ?? 0) * value;
        energy += value * value;
      }
    }
    scores.push(product / Math.max(Math.sqrt(headEnergy * energy), NO_ENERGY));
  }
  const best = Math.max(...scores, 0);
  // Nothing in it lines up with anything: all a place would do is take more away.
  const lag = best < WORTH_ALIGNING ? 0 : Math.max(0, scores.findIndex((score) => score >= best - ALIGN_TOLERANCE));
  return { lag, correlation: scores[lag] ?? 0 };
}

/**
 * The tail fading into the head. Between things unlike each other (noise) the gains keep the power; between things
 * alike (a tone lined up with itself) they keep the sum; the correlation found says how far it is one or the other.
 */
export function crossfadeTailIntoHead(head: readonly Float32Array[], tail: readonly Float32Array[], state: SeamState): LoopCrossfade {
  const frames = state === 'ramp' ? CROSSFADE_FRAMES : SHORT_CROSSFADE_FRAMES;
  const aligned = alignTail(head, tail, frames);
  const alike = Math.max(0, aligned.correlation);
  const start = frameCount(tail) - aligned.lag - frames;
  const planes = head.map((h, channel) => {
    const t = tail[channel];
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      const angle = ((i + 0.5) / frames) * (Math.PI / 2);
      const fadeOut = Math.cos(angle);
      const fadeIn = Math.sin(angle);
      out[i] = ((t?.[start + i] ?? 0) * fadeOut + (h[i] ?? 0) * fadeIn) / Math.sqrt(1 + 2 * alike * fadeOut * fadeIn);
    }
    return out;
  });
  return { planes, lag: aligned.lag };
}
