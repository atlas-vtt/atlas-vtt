import { SOUND_RATE } from '@/app/sound/engine/soundMath';
import { rmsAt } from './soundHarness';

const WINDOW_FRAMES = Math.round(0.01 * SOUND_RATE);
const HOP_FRAMES = Math.round(0.001 * SOUND_RATE);
/** How far either side of a place its surroundings are read. */
const AROUND_FRAMES = Math.round(0.25 * SOUND_RATE);
/** Left out of the surroundings: where the place itself shows. */
const CLEAR_FRAMES = Math.round(0.03 * SOUND_RATE);
/** Under 16 bits' last step: what a hole holds in a decoded file. */
const SILENT = 1 / 65_536;
const SPLATTER_FRAMES = Math.round(0.002 * SOUND_RATE);

export interface PlaceMeasure {
  /** Largest sample-to-sample step within a frame of the place. */
  step: number;
  /** The step against the 99.9th percentile of the steps around it: 1 is as large as the signal's own largest. */
  stepRatio: number;
  /** Largest change of slope within a frame of the place, against the same percentile of those around it. */
  bendRatio: number;
  /** Quietest 10 ms window over the place against the median 10 ms window around it, in dB. Negative is a dip. */
  dipDb: number;
  /** Loudest such window, in dB. Positive is a bump. */
  bumpDb: number;
  /** Longest run around the place below the last step of 16 bits, in frames. */
  hole: number;
  /** Energy of the signal's second difference over 2 ms at the place, against the median of those around it, in dB. What a click or a phase slip splatters. */
  clickDb: number;
}

function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

/** Stretches around a place and clear of it. */
function aroundFrames(at: number, length: number): Array<[number, number]> {
  const stretches: Array<[number, number]> = [
    [Math.max(1, at - AROUND_FRAMES), at - CLEAR_FRAMES],
    [at + CLEAR_FRAMES, Math.min(length - 1, at + AROUND_FRAMES)],
  ];
  return stretches.filter(([from, to]) => to > from);
}

/** What a wrap (or any other place, for the comparison) does to the signal, read off what was rendered. */
export function measurePlace(samples: Float32Array, at: number): PlaceMeasure {
  const value = (i: number): number => samples[i] ?? 0;
  const step = (i: number): number => Math.abs(value(i) - value(i - 1));
  const bend = (i: number): number => Math.abs(value(i + 1) - 2 * value(i) + value(i - 1));
  const steps: number[] = [];
  const bends: number[] = [];
  const windows: number[] = [];
  for (const [from, to] of aroundFrames(at, samples.length)) {
    for (let i = from; i < to; i++) {
      steps.push(step(i));
      bends.push(bend(i));
    }
    for (let i = from; i + WINDOW_FRAMES <= to; i += HOP_FRAMES) windows.push(rmsAt(samples, i, WINDOW_FRAMES));
  }
  const reference = Math.max(percentile(windows, 0.5), 1e-9);
  let quietest = Infinity;
  let loudest = 0;
  for (let i = at - WINDOW_FRAMES; i <= at; i += HOP_FRAMES) {
    const rms = rmsAt(samples, i, WINDOW_FRAMES);
    quietest = Math.min(quietest, rms);
    loudest = Math.max(loudest, rms);
  }
  let hole = 0;
  let run = 0;
  for (let i = at - CLEAR_FRAMES; i < at + CLEAR_FRAMES; i++) {
    run = Math.abs(value(i)) < SILENT ? run + 1 : 0;
    hole = Math.max(hole, run);
  }
  const splatter = (from: number): number => {
    let sum = 0;
    for (let i = from; i < from + SPLATTER_FRAMES; i++) sum += bend(i) ** 2;
    return Math.sqrt(sum / SPLATTER_FRAMES);
  };
  const around: number[] = [];
  for (const [from, to] of aroundFrames(at, samples.length)) for (let i = from; i + SPLATTER_FRAMES <= to; i += HOP_FRAMES) around.push(splatter(i));
  let loudestSplatter = 0;
  for (let i = at - SPLATTER_FRAMES; i <= at; i += 12) loudestSplatter = Math.max(loudestSplatter, splatter(i));
  const clickDb = 20 * Math.log10(Math.max(loudestSplatter, 1e-9) / Math.max(percentile(around, 0.5), 1e-9));
  const atStep = Math.max(step(at - 1), step(at), step(at + 1));
  const atBend = Math.max(bend(at - 1), bend(at));
  return {
    step: atStep,
    stepRatio: atStep / Math.max(percentile(steps, 0.999), 1e-9),
    bendRatio: atBend / Math.max(percentile(bends, 0.999), 1e-9),
    dipDb: 20 * Math.log10(Math.max(quietest, 1e-9) / reference),
    bumpDb: 20 * Math.log10(Math.max(loudest, 1e-9) / reference),
    hole,
    clickDb,
  };
}

export interface SpreadMeasure {
  /** The worst the signal does by itself at places that are no wrap: its largest step ratio, deepest dip, highest bump. */
  stepRatio: number;
  bendRatio: number;
  dipDb: number;
  bumpDb: number;
  clickDb: number;
}

/** The same measures at evenly spaced places inside the sound, away from every wrap. */
export function measureSpread(samples: Float32Array, frames: number, first: number, count = 40): SpreadMeasure {
  const spread: SpreadMeasure = { stepRatio: 0, bendRatio: 0, dipDb: 0, bumpDb: -Infinity, clickDb: -Infinity };
  const margin = AROUND_FRAMES + CLEAR_FRAMES;
  const usable = frames - 2 * margin;
  for (let k = 0; k < count && usable > 0; k++) {
    const at = first + margin + Math.round((usable * k) / count);
    const place = measurePlace(samples, at);
    spread.stepRatio = Math.max(spread.stepRatio, place.stepRatio);
    spread.bendRatio = Math.max(spread.bendRatio, place.bendRatio);
    spread.dipDb = Math.min(spread.dipDb, place.dipDb);
    spread.bumpDb = Math.max(spread.bumpDb, place.bumpDb);
    spread.clickDb = Math.max(spread.clickDb, place.clickDb);
  }
  return spread;
}

const MATCH_FRAMES = 12_000;
const MATCH_FROM = 2400;
const MATCH_REACH = 1500;

/**
 * Where in a render the sound's frame 0 lies, near the frame it should: found by matching the decoded file
 * sample by sample, as nothing else says where a wrap lands in what was rendered.
 */
export function wrapFrameNear(samples: Float32Array, decoded: Float32Array, expected: number): number {
  let best = expected;
  let smallest = Infinity;
  for (let at = expected - MATCH_REACH; at <= expected + MATCH_REACH; at++) {
    let sum = 0;
    for (let i = 0; i < MATCH_FRAMES && sum < smallest; i += 2) sum += ((samples[at + MATCH_FROM + i] ?? 0) - (decoded[MATCH_FROM + i] ?? 0)) ** 2;
    if (sum < smallest) {
      smallest = sum;
      best = at;
    }
  }
  return best;
}
