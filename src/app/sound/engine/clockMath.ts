import { median } from './soundMath';

/** One time exchange: the client's send and receive times and the table clock's answer, in ms. */
export interface ClockSample {
  t1: number;
  t2: number;
  t4: number;
}

/** The lowest round trips are the ones whose answer lies nearest the middle of the exchange. */
const BEST_SAMPLES = 3;

export function clockOffset(sample: ClockSample): number {
  return sample.t2 - (sample.t1 + sample.t4) / 2;
}

export function roundTrip(sample: ClockSample): number {
  return sample.t4 - sample.t1;
}

/** Table time minus local time: the median of the samples with the lowest round trips. Null without one. */
export function estimateClockOffset(samples: readonly ClockSample[]): number | null {
  const usable = samples.filter((sample) => roundTrip(sample) >= 0);
  if (usable.length === 0) return null;
  const best = [...usable].sort((a, b) => roundTrip(a) - roundTrip(b)).slice(0, BEST_SAMPLES);
  return median(best.map(clockOffset));
}
