import type { SoundParam } from './audioNodes';
import { fadeInGain, fadeOutGain } from './soundMath';

/** A fader's time constant where no fade length is given. */
const FADER_SECONDS = 0.04;
/** A curve may not overlap the value the hold leaves at its start. */
const AFTER_HOLD_SECONDS = 1 / 375;
const MIN_CURVE_POINTS = 16;
const MAX_CURVE_POINTS = 256;
const CURVE_POINTS_PER_SECOND = 64;

type Motion =
  | { kind: 'still'; value: number }
  | { kind: 'curve'; values: Float32Array<ArrayBuffer>; at: number; seconds: number; before: number }
  | { kind: 'target'; from: number; to: number; at: number; constant: number };

/** The curve from `from` to `to`, over the part of the fade from `fromProgress` on. */
function fadeCurve(from: number, to: number, seconds: number, fromProgress = 0): Float32Array<ArrayBuffer> {
  const points = Math.min(MAX_CURVE_POINTS, Math.max(MIN_CURVE_POINTS, Math.ceil(seconds * CURVE_POINTS_PER_SECOND)));
  const values = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const progress = fromProgress + ((1 - fromProgress) * i) / (points - 1);
    values[i] = to >= from ? from + (to - from) * fadeInGain(progress) : to + (from - to) * fadeOutGain(progress);
  }
  return values;
}

/**
 * Drives one gain over the context's clock, and knows what it will be at any time without reading the
 * param back: a param's `.value` says nothing about the future, and an offline context's nothing at all.
 */
export class GainTrack {
  private motion: Motion;

  constructor(
    private readonly param: SoundParam,
    initial: number,
  ) {
    param.value = initial;
    this.motion = { kind: 'still', value: initial };
  }

  /** Where the gain is heading. */
  get target(): number {
    const motion = this.motion;
    if (motion.kind === 'still') return motion.value;
    if (motion.kind === 'target') return motion.to;
    return motion.values[motion.values.length - 1] ?? 0;
  }

  valueAt(time: number): number {
    const motion = this.motion;
    if (motion.kind === 'still') return motion.value;
    if (motion.kind === 'target') {
      return time <= motion.at ? motion.from : motion.to + (motion.from - motion.to) * Math.exp(-(time - motion.at) / motion.constant);
    }
    if (time <= motion.at) return motion.before;
    const position = ((time - motion.at) / motion.seconds) * (motion.values.length - 1);
    const index = Math.floor(position);
    const low = motion.values[index];
    const high = motion.values[index + 1];
    if (low === undefined) return motion.values[motion.values.length - 1] ?? 0;
    return high === undefined ? low : low + (high - low) * (position - index);
  }

  /** A fade from whatever the gain will be at `at`, over by `at + seconds`. */
  fade(to: number, at: number, seconds: number): void {
    const from = this.hold(at);
    this.curve(fadeCurve(from, to, seconds), from, at, seconds);
  }

  /** Comes in on a fade already under way: the part from `progress` on, starting at `at`. */
  join(from: number, to: number, at: number, seconds: number, progress: number): void {
    const values = fadeCurve(from, to, seconds, progress);
    const first = values[0] ?? 0;
    this.param.cancelScheduledValues(at);
    this.param.setValueAtTime(first, at);
    this.curve(values, first, at, seconds);
  }

  /** A fader: moves towards `to`, 95 % of the way over `seconds`. */
  move(to: number, at: number, seconds: number): void {
    const from = this.hold(at);
    const constant = Math.max(FADER_SECONDS, seconds / 3);
    this.param.setTargetAtTime(to, at + AFTER_HOLD_SECONDS, constant);
    this.motion = { kind: 'target', from, to, at: at + AFTER_HOLD_SECONDS, constant };
  }

  /** Starts just after `at`, where a value was just set, and ends when asked, which a stop may rely on. */
  private curve(values: Float32Array<ArrayBuffer>, before: number, at: number, seconds: number): void {
    const start = at + AFTER_HOLD_SECONDS;
    const length = Math.max(AFTER_HOLD_SECONDS, seconds - AFTER_HOLD_SECONDS);
    this.param.setValueCurveAtTime(values, start, length);
    this.motion = { kind: 'curve', values, at: start, seconds: length, before };
  }

  /** Ends what is under way at `at`, holding the value it had reached. */
  private hold(at: number): number {
    const value = this.valueAt(at);
    if (this.param.cancelAndHoldAtTime) {
      this.param.cancelAndHoldAtTime(at);
    } else {
      this.param.cancelScheduledValues(at);
      this.param.setValueAtTime(value, at);
    }
    return value;
  }
}
