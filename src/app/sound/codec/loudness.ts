/** ITU-R BS.1770-4 K-weighting at 48 kHz. Every sound is measured at this rate. */
const SHELF_B = [1.53512485958697, -2.69169618940638, 1.19839281085285] as const;
const SHELF_A = [-1.69065929318241, 0.73248077421585] as const;
const HIGHPASS_B = [1, -2, 1] as const;
const HIGHPASS_A = [-1.99004745483398, 0.99007225036621] as const;

const STEP_FRAMES = 4800;
const STEPS_PER_BLOCK = 4;
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = 10;
const LUFS_OFFSET = -0.691;

const PEAK_OVERSAMPLING = 4;
const PEAK_TAPS = 24;
const PEAK_KAISER_BETA = 8;

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; term > 1e-10 * sum; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
  }
  return sum;
}

/**
 * 4x oversampling as BS.1770-4 asks, with a Kaiser-windowed sinc of 24 taps a phase and not the 12 of the
 * standard's example: that one rolls off below Nyquist and read wide-band sounds 0.8 dB under ffmpeg.
 * The sample itself is one of the four phases, so three are computed.
 */
const PEAK_PHASES: readonly Float64Array[] = [1, 2, 3].map((phase) => {
  const taps = new Float64Array(PEAK_TAPS);
  for (let tap = 0; tap < PEAK_TAPS; tap++) {
    const position = tap - PEAK_TAPS / 2 + 1 - phase / PEAK_OVERSAMPLING;
    const edge = position / (PEAK_TAPS / 2);
    const sinc = Math.sin(Math.PI * position) / (Math.PI * position);
    taps[tap] = (sinc * besselI0(PEAK_KAISER_BETA * Math.sqrt(Math.max(0, 1 - edge * edge)))) / besselI0(PEAK_KAISER_BETA);
  }
  return taps;
});
/** What a sinc interpolation can make of samples no louder than one: quieter pieces are not worth computing. */
const PEAK_FILTER_BOUND = 2;
/**
 * The most any phase can make of a window whose samples are no louder than one, with room for rounding: a
 * window whose loudest sample times this cannot pass the peak so far is skipped, and the peak found is the same.
 */
const PEAK_WINDOW_GAIN = Math.max(...PEAK_PHASES.map((phase) => phase.reduce((sum, tap) => sum + Math.abs(tap), 0))) * (1 + 1e-9);

function loudnessOf(energy: number): number {
  return LUFS_OFFSET + 10 * Math.log10(energy);
}

/** Two biquads over one channel, state kept between pieces. */
class KWeighting {
  private readonly state = new Float64Array(8);

  /** Adds the square of each weighted sample to `energy`, frame by frame. */
  accumulate(samples: Float32Array, energy: Float64Array): void {
    const s = this.state;
    let [x1, x2, y1, y2, u1, u2, v1, v2] = [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0, s[3] ?? 0, s[4] ?? 0, s[5] ?? 0, s[6] ?? 0, s[7] ?? 0];
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i] ?? 0;
      const y = SHELF_B[0] * x + SHELF_B[1] * x1 + SHELF_B[2] * x2 - SHELF_A[0] * y1 - SHELF_A[1] * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      const v = HIGHPASS_B[0] * y + HIGHPASS_B[1] * u1 + HIGHPASS_B[2] * u2 - HIGHPASS_A[0] * v1 - HIGHPASS_A[1] * v2;
      u2 = u1;
      u1 = y;
      v2 = v1;
      v1 = v;
      energy[i] = (energy[i] ?? 0) + v * v;
    }
    s.set([x1, x2, y1, y2, u1, u2, v1, v2]);
  }
}

/** Sample peaks are lower than what the converter draws between samples: this finds those, per channel. */
class TruePeak {
  /** The last samples of the previous piece, so a piece's start has its filter history. */
  private readonly history = new Float32Array(PEAK_TAPS);
  peak = 0;

  add(samples: Float32Array): void {
    let loudest = 0;
    for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
    if (loudest > this.peak) this.peak = loudest;
    if (loudest * PEAK_FILTER_BOUND > this.peak) this.oversample(samples);
    if (samples.length >= PEAK_TAPS) {
      this.history.set(samples.subarray(samples.length - PEAK_TAPS));
    } else {
      this.history.copyWithin(0, samples.length);
      this.history.set(samples, PEAK_TAPS - samples.length);
    }
  }

  private oversample(samples: Float32Array): void {
    const joined = new Float32Array(PEAK_TAPS + samples.length);
    joined.set(this.history);
    joined.set(samples, PEAK_TAPS);
    // The loudest sample of each run of PEAK_TAPS: a window spans two runs at most, so their larger one bounds it.
    const runs = new Float32Array(Math.ceil(joined.length / PEAK_TAPS));
    for (let i = 0; i < joined.length; i++) {
      const run = (i / PEAK_TAPS) | 0;
      const value = Math.abs(joined[i]!);
      if (value > runs[run]!) runs[run] = value;
    }
    let peak = this.peak;
    for (let i = PEAK_TAPS; i < joined.length; i++) {
      const bound = Math.max(runs[((i - PEAK_TAPS + 1) / PEAK_TAPS) | 0]!, runs[(i / PEAK_TAPS) | 0]!) * PEAK_WINDOW_GAIN;
      if (bound <= peak) continue;
      for (const phase of PEAK_PHASES) {
        let sum = 0;
        for (let tap = 0; tap < PEAK_TAPS; tap++) sum += phase[tap]! * joined[i - tap]!;
        const value = Math.abs(sum);
        if (value > peak) peak = value;
      }
    }
    this.peak = peak;
  }
}

export interface LoudnessResult {
  /** Integrated loudness. -Infinity where no block passes the gate, or the sound holds no full block. */
  lufs: number;
  truePeakDb: number;
}

/** Integrated loudness and true peak of pieces handed in order, without holding the audio. */
export class LoudnessMeter {
  private readonly weighting: KWeighting[];
  private readonly peaks: TruePeak[];
  private readonly steps: number[] = [];
  private stepEnergy = 0;
  private stepFill = 0;
  /** Per frame of the current piece: the channels' weighted squares added up. */
  private frameEnergy = new Float64Array(0);

  constructor(private readonly channels: number) {
    this.weighting = Array.from({ length: channels }, () => new KWeighting());
    this.peaks = Array.from({ length: channels }, () => new TruePeak());
  }

  add(planes: readonly Float32Array[]): void {
    const frames = planes[0]?.length ?? 0;
    if (this.frameEnergy.length < frames) this.frameEnergy = new Float64Array(frames);
    else this.frameEnergy.fill(0, 0, frames);
    const energy = this.frameEnergy;
    for (let channel = 0; channel < this.channels; channel++) {
      const samples = planes[channel];
      if (!samples) continue;
      this.weighting[channel]?.accumulate(samples, energy);
      this.peaks[channel]?.add(samples);
    }
    for (let i = 0; i < frames; i++) {
      this.stepEnergy += energy[i] ?? 0;
      if (++this.stepFill === STEP_FRAMES) {
        this.steps.push(this.stepEnergy / STEP_FRAMES);
        this.stepEnergy = 0;
        this.stepFill = 0;
      }
    }
  }

  result(): LoudnessResult {
    const blocks: number[] = [];
    for (let i = STEPS_PER_BLOCK - 1; i < this.steps.length; i++) {
      let sum = 0;
      for (let step = 0; step < STEPS_PER_BLOCK; step++) sum += this.steps[i - step] ?? 0;
      blocks.push(sum / STEPS_PER_BLOCK);
    }
    const aboveAbsolute = blocks.filter((energy) => loudnessOf(energy) > ABSOLUTE_GATE);
    const peak = Math.max(0, ...this.peaks.map((meter) => meter.peak));
    const truePeakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    if (aboveAbsolute.length === 0) return { lufs: -Infinity, truePeakDb };
    const relativeGate = loudnessOf(mean(aboveAbsolute)) - RELATIVE_GATE;
    const gated = aboveAbsolute.filter((energy) => loudnessOf(energy) > relativeGate);
    return { lufs: gated.length > 0 ? loudnessOf(mean(gated)) : -Infinity, truePeakDb };
  }
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
