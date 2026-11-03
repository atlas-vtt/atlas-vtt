import { SOUND_RATE } from '../engine/soundMath';

/** Below 16 bits' last step: what a digital silence's dither or a decoder's rounding leaves. */
const DIGITAL_SILENCE = 1 / 65_536;
const ZERO_CROSSINGS = 16;
const KAISER_BETA = 9;
const CENTRE_GAIN = Math.SQRT1_2;

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; term > 1e-10 * sum; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
  }
  return sum;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** To at most stereo: more channels come down by the usual weights, front, centre and surround. */
export function toStereo(planes: readonly Float32Array<ArrayBuffer>[]): Float32Array<ArrayBuffer>[] {
  if (planes.length <= 2) return [...planes];
  const frames = planes[0]?.length ?? 0;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const scale = 1 / (1 + 2 * CENTRE_GAIN);
  const [frontLeft, frontRight, centre, , surroundLeft, surroundRight] = planes;
  for (let i = 0; i < frames; i++) {
    const c = (centre?.[i] ?? 0) * CENTRE_GAIN;
    left[i] = ((frontLeft?.[i] ?? 0) + c + (surroundLeft?.[i] ?? 0) * CENTRE_GAIN) * scale;
    right[i] = ((frontRight?.[i] ?? 0) + c + (surroundRight?.[i] ?? 0) * CENTRE_GAIN) * scale;
  }
  return [left, right];
}

/**
 * To 48 kHz: a Kaiser-windowed sinc, over a table of the exact phases between the two rates, so output
 * frame n lies exactly where it should and the length comes out whole. Lowers its cutoff when it downsamples.
 */
export class Resampler {
  private readonly up: number;
  private readonly down: number;
  private readonly reach: number;
  private readonly phases: Float32Array;
  private readonly taps: number;
  private history: Float32Array<ArrayBuffer>[];
  /** Frames dropped from the front of `history` so far. */
  private historyStart = 0;
  private output = 0;
  private input = 0;
  /** A sound that wraps: its first frames, which its end's filter reads instead of nothing. */
  private wrapHead: Float32Array<ArrayBuffer>[] | null;

  constructor(inputRate: number, channels: number, wraps = false) {
    const divisor = gcd(inputRate, SOUND_RATE);
    this.up = SOUND_RATE / divisor;
    this.down = inputRate / divisor;
    const cutoff = Math.min(1, SOUND_RATE / inputRate);
    this.reach = Math.ceil(ZERO_CROSSINGS / cutoff);
    this.taps = this.reach * 2;
    this.phases = new Float32Array(this.up * this.taps);
    const edge = besselI0(KAISER_BETA);
    for (let phase = 0; phase < this.up; phase++) {
      for (let tap = 0; tap < this.taps; tap++) {
        const x = tap - this.reach + 1 - phase / this.up;
        const t = x / this.reach;
        const window = Math.abs(t) >= 1 ? 0 : besselI0(KAISER_BETA * Math.sqrt(1 - t * t)) / edge;
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x * cutoff) / (Math.PI * x * cutoff);
        this.phases[phase * this.taps + tap] = cutoff * sinc * window;
      }
    }
    // The silence before the first frame, held as zeros so the filter never reads past the start.
    this.history = Array.from({ length: channels }, () => new Float32Array(this.reach));
    this.historyStart = -this.reach;
    this.wrapHead = wraps ? Array.from({ length: channels }, () => new Float32Array(0)) : null;
  }

  /** Frames at the start that lack what lies before them, and that `flush` gives again past the end, whole, where the sound wraps. */
  get wrapFrames(): number {
    return this.wrapHead ? Math.ceil((this.reach * this.up) / this.down) : 0;
  }

  process(planes: readonly Float32Array<ArrayBuffer>[]): Float32Array<ArrayBuffer>[] {
    if (this.wrapHead && (this.wrapHead[0]?.length ?? 0) < 2 * this.reach) {
      const room = 2 * this.reach - (this.wrapHead[0]?.length ?? 0);
      this.wrapHead = this.wrapHead.map((held, channel) => joined(held, (planes[channel] ?? new Float32Array(0)).slice(0, room)));
    }
    this.input += planes[0]?.length ?? 0;
    this.history = this.history.map((old, channel) => joined(old, planes[channel] ?? new Float32Array(0)));
    return this.drain(this.input - this.reach);
  }

  /** What is left: the filter's tail, cut to the length the source has at this rate. */
  flush(): Float32Array<ArrayBuffer>[] {
    const length = Math.round((this.input * this.up) / this.down);
    if (this.wrapHead) {
      const head = this.wrapHead;
      this.history = this.history.map((old, channel) => joined(old, head[channel] ?? new Float32Array(0)));
      return this.drain(this.input + this.reach, length + this.wrapFrames);
    }
    const padding = new Float32Array(this.reach);
    this.history = this.history.map((old) => joined(old, padding));
    return this.drain(this.input, length);
  }

  /**
   * Writes every output frame whose filter reaches no further than input frame `limit` + reach. The hot loop
   * of a conversion: one channel at a time over plain locals, in the order the sum was always taken, so the
   * output is the same to the last bit.
   */
  private drain(limit: number, lastOutput = Infinity): Float32Array<ArrayBuffer>[] {
    const end = Math.min(lastOutput, Math.ceil((limit * this.up) / this.down));
    const count = Math.max(0, end - this.output);
    const { phases, taps, up, down, reach, historyStart } = this;
    const out = this.history.map((history) => {
      const plane = new Float32Array(count);
      let position = this.output * down;
      for (let i = 0; i < count; i++, position += down) {
        const whole = Math.floor(position / up);
        const offset = (position - whole * up) * taps;
        const first = whole - reach + 1 - historyStart;
        let sum = 0;
        for (let tap = 0; tap < taps; tap++) sum += phases[offset + tap]! * history[first + tap]!;
        plane[i] = sum;
      }
      return plane;
    });
    this.output += count;
    this.forget();
    return out;
  }

  private forget(): void {
    const keepFrom = Math.floor((this.output * this.down) / this.up) - this.reach;
    const drop = keepFrom - this.historyStart;
    if (drop <= 0) return;
    this.history = this.history.map((plane) => plane.slice(drop));
    this.historyStart = keepFrom;
  }
}

export function joined(a: Float32Array<ArrayBuffer>, b: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/**
 * Takes digital silence off both ends of a sound marked as a loop, where it would sound as a hole on every
 * pass. In a stream: the start is dropped until sound begins; a silent stretch is only counted, and handed on
 * as zeros once sound follows it, so the end's never is.
 */
export class SilenceTrim {
  private started = false;
  private held = 0;
  /** What came off the start, as far as it has got. */
  droppedFrames = 0;

  constructor(private readonly channels: number) {}

  process(planes: readonly Float32Array<ArrayBuffer>[], emit: (planes: Float32Array<ArrayBuffer>[]) => void): void {
    const frames = planes[0]?.length ?? 0;
    let firstLoud = frames;
    let lastLoud = -1;
    for (let i = 0; i < frames; i++) {
      if (planes.some((plane) => Math.abs(plane[i] ?? 0) > DIGITAL_SILENCE)) {
        if (firstLoud === frames) firstLoud = i;
        lastLoud = i;
      }
    }
    if (lastLoud < 0) {
      if (this.started) this.held += frames;
      else this.droppedFrames += frames;
      return;
    }
    const start = this.started ? 0 : firstLoud;
    if (!this.started) this.droppedFrames += firstLoud;
    this.emitZeros(emit);
    this.started = true;
    this.held = frames - 1 - lastLoud;
    emit(planes.map((plane) => plane.subarray(start, lastLoud + 1)));
  }

  private emitZeros(emit: (planes: Float32Array<ArrayBuffer>[]) => void): void {
    while (this.held > 0) {
      const count = Math.min(this.held, SOUND_RATE);
      emit(Array.from({ length: this.channels }, () => new Float32Array(count)));
      this.held -= count;
    }
  }
}
