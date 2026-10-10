/**
 * Grid-type and rough cell-size hypotheses from the power spectrum of a map's
 * line structure.
 *
 * A square grid puts its energy on the two frequency axes. A hex lattice with
 * centre spacing S has six reciprocal-lattice peaks at radius 2 / (sqrt(3) S):
 * perpendicular to the rows of centres, so at 30° + k·60° for pointy-top hexes
 * and at k·60° for flat-top hexes. Peaks are scored against the median power on
 * the same ring so texture and low-frequency content do not masquerade as grids,
 * and summed over their harmonics.
 * The spectrum only proposes: a peak may be a harmonic (honeycombs have weak
 * fundamentals) or belong to map art, so the caller fits every proposal to the
 * map's lines and keeps the one they support.
 *
 * A grid whose cells are not regular (rows `aspect` times further apart than a
 * regular grid's) has the same peaks with their vertical frequency divided by
 * `aspect`, so the same search run at other aspects finds stretched grids.
 */

import type { GridType } from '../../grid/GridSystem';

export interface SpectralHypothesis {
  gridType: GridType;
  /** Cell size in pixels of the analysed image (flat-to-flat for hexes). */
  cellSize: number;
  /** Harmonic sum of the peak-to-ring-median excess; comparable between hypotheses of one image. */
  score: number;
  /** How many times further apart the image's rows lie than a regular grid's; 1 for a regular grid. */
  aspect: number;
  /** The angle in radians the map lies turned by; unset is level. */
  rotation?: number;
}

const SQRT3 = Math.sqrt(3);
const RING_SAMPLES = 72;
const K_STEP = 0.25;
/** Ratios up to this are what ring noise reaches on its own; only the excess above it is evidence. */
const NOISE_RATIO = 3;
/** Weight of each further harmonic relative to the one before. */
const HARMONIC_DECAY = 0.85;
/** Harmonic score below which a frequency is not proposed at all. */
const MIN_HARMONIC_SCORE = 3;
const PROPOSALS_PER_TYPE = 2;
/** Aspects tried for grids that are not regular: 1 % steps up to a quarter either way. */
const ASPECT_STEP = 1.01;
const ASPECT_STEPS = 22;
/** Aspects proposed per grid type, each the best of its neighbourhood. */
const ASPECTS_PER_TYPE = 2;
/** Angles tried for maps that lie askew: half-degree steps up to four degrees either way. */
const ROTATION_STEP = (0.5 * Math.PI) / 180;
const ROTATION_STEPS = 8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

const SQUARE_ANGLES = [0, 90, 180, 270].map(toRadians);
const FLAT_ANGLES = [0, 60, 120, 180, 240, 300].map(toRadians);
const POINTY_ANGLES = [30, 90, 150, 210, 270, 330].map(toRadians);

function readPower(power: Float32Array, n: number, fx: number, fy: number): number {
  const x = fx + n / 2;
  const y = fy + n / 2;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= n || y0 + 1 >= n) return 0;
  const tx = x - x0;
  const ty = y - y0;
  const i = y0 * n + x0;
  const top = power[i]! * (1 - tx) + power[i + 1]! * tx;
  const bottom = power[i + n]! * (1 - tx) + power[i + n + 1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

function ringMedian(power: Float32Array, n: number, k: number): number {
  const samples: number[] = [];
  for (let i = 0; i < RING_SAMPLES; i++) {
    const angle = (2 * Math.PI * i) / RING_SAMPLES;
    samples.push(readPower(power, n, k * Math.cos(angle), k * Math.sin(angle)));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

function peakRatioAt(power: Float32Array, n: number, k: number, angles: number[]): number {
  const background = ringMedian(power, n, k);
  if (background <= 0) return 0;
  let sum = 0;
  for (const angle of angles) sum += readPower(power, n, k * Math.cos(angle), k * Math.sin(angle));
  return sum / angles.length / background;
}

/** Ring medians by radius, shared by every aspect of one spectrum: each peak is compared with the ring it lies on. */
type RingMedians = (radius: number) => number;

function ringMedians(power: Float32Array, n: number): RingMedians {
  const known = new Map<number, number>();
  return (radius) => {
    const step = Math.round(radius / K_STEP);
    let median = known.get(step);
    if (median === undefined) {
      median = ringMedian(power, n, step * K_STEP);
      known.set(step, median);
    }
    return median;
  };
}

/** `peakRatioAt` for a grid of another aspect: its peaks lie at different radii, so each has its own ring. */
function stretchedPeakRatioAt(power: Float32Array, n: number, k: number, angles: number[], aspect: number, rings: RingMedians): number {
  let sum = 0;
  for (const angle of angles) {
    const fx = k * Math.cos(angle);
    const fy = (k * Math.sin(angle)) / aspect;
    const background = rings(Math.hypot(fx, fy));
    if (background > 0) sum += readPower(power, n, fx, fy) / background;
  }
  return sum / angles.length;
}

function cellSizeFromFrequency(gridType: GridType, n: number, k: number): number {
  return gridType === 'square' ? n / k : (2 * n) / (SQRT3 * k);
}

/**
 * Candidate fundamentals for a grid type, best first.
 *
 * Thin grid lines are a comb: their harmonics are as strong as the fundamental,
 * while map art fades with frequency, so on a textured map the fundamental alone
 * barely rises above its ring and the higher harmonics stand out. Summing the
 * evidence at k, 2k, 3k… (as pitch detectors do) rewards the frequency that
 * explains the whole series. A sub- or super-harmonic may still win; the caller
 * fits the half and the double of every supported proposal.
 */
function candidateFundamentals(
  power: Float32Array,
  n: number,
  gridType: GridType,
  angles: number[],
  kMin: number,
  kMax: number,
  stretched?: { aspect: number; rings: RingMedians },
): SpectralHypothesis[] {
  const ratios: number[] = [];
  for (let k = kMin; k <= kMax; k += K_STEP) {
    ratios.push(stretched ? stretchedPeakRatioAt(power, n, k, angles, stretched.aspect, stretched.rings) : peakRatioAt(power, n, k, angles));
  }

  /** Peak excess over the ring background around frequency `k`; harmonics may sit a little off their nominal place. */
  const excessAt = (k: number, slack: number): number => {
    const from = Math.max(0, Math.floor((k - slack - kMin) / K_STEP));
    const to = Math.min(ratios.length - 1, Math.ceil((k + slack - kMin) / K_STEP));
    let best = NOISE_RATIO;
    for (let i = from; i <= to; i++) best = Math.max(best, ratios[i]!);
    return best - NOISE_RATIO;
  };

  const scores = ratios.map((_, i) => {
    const k = kMin + i * K_STEP;
    let score = 0;
    for (let h = 1; h * k <= kMax; h++) score += HARMONIC_DECAY ** (h - 1) * excessAt(h * k, (h * K_STEP) / 2);
    return score;
  });

  const peaks: number[] = [];
  for (let i = 1; i < scores.length - 1; i++) {
    if (scores[i]! >= MIN_HARMONIC_SCORE && scores[i]! > scores[i - 1]! && scores[i]! >= scores[i + 1]!) peaks.push(i);
  }
  return peaks
    .sort((a, b) => scores[b]! - scores[a]!)
    .slice(0, PROPOSALS_PER_TYPE)
    .map((i) => ({ gridType, cellSize: cellSizeFromFrequency(gridType, n, kMin + i * K_STEP), score: scores[i]!, aspect: stretched?.aspect ?? 1 }));
}

const GRID_ANGLES: ReadonlyArray<[GridType, number[]]> = [
  ['square', SQUARE_ANGLES],
  ['hex-vertical', POINTY_ANGLES],
  ['hex-horizontal', FLAT_ANGLES],
];

/**
 * Regular grid hypotheses worth fitting, for every grid type. `minPeriod`/`maxPeriod` bound
 * the line spacing (in analysed pixels) considered plausible.
 */
export function spectralHypotheses(
  power: Float32Array,
  n: number,
  minPeriod: number,
  maxPeriod: number,
): SpectralHypothesis[] {
  const kMin = n / maxPeriod;
  const kMax = Math.min(n / minPeriod, n / 2 - 2);
  return GRID_ANGLES.flatMap(([gridType, angles]) => candidateFundamentals(power, n, gridType, angles, kMin, kMax));
}

/**
 * Hypotheses of grids that are not regular, for every grid type: the aspects whose best
 * fundamental stands out among the aspects next to them and beats the regular grid's.
 */
export function stretchedHypotheses(
  power: Float32Array,
  n: number,
  minPeriod: number,
  maxPeriod: number,
): SpectralHypothesis[] {
  const kMin = n / maxPeriod;
  // A squeezed grid's peaks lie further out than a regular grid's; they must stay inside the spectrum.
  const kMax = Math.min(n / minPeriod, (n / 2 - 2) / ASPECT_STEP ** ASPECT_STEPS);
  const rings = ringMedians(power, n);
  const aspects = Array.from({ length: 2 * ASPECT_STEPS + 1 }, (_, i) => ASPECT_STEP ** (i - ASPECT_STEPS));

  return GRID_ANGLES.flatMap(([gridType, angles]) => {
    const best = aspects.map((aspect) => candidateFundamentals(power, n, gridType, angles, kMin, kMax, { aspect, rings })[0] ?? null);
    const regular = best[ASPECT_STEPS]?.score ?? 0;
    return best
      .filter((hypothesis, i): hypothesis is SpectralHypothesis => {
        if (!hypothesis || i === ASPECT_STEPS || hypothesis.score <= regular) return false;
        return hypothesis.score > (best[i - 1]?.score ?? 0) && hypothesis.score >= (best[i + 1]?.score ?? 0);
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, ASPECTS_PER_TYPE);
  });
}

/**
 * Hypotheses of regular grids on a map that lies askew, for every grid type: a turned image has a
 * turned spectrum, so the same search with its angles turned finds them. Per type the angle whose
 * best fundamental beats the level grid's and its neighbours'.
 */
export function turnedHypotheses(
  power: Float32Array,
  n: number,
  minPeriod: number,
  maxPeriod: number,
): SpectralHypothesis[] {
  const kMin = n / maxPeriod;
  const kMax = Math.min(n / minPeriod, n / 2 - 2);
  const rotations = Array.from({ length: 2 * ROTATION_STEPS + 1 }, (_, i) => (i - ROTATION_STEPS) * ROTATION_STEP);

  return GRID_ANGLES.flatMap(([gridType, angles]) => {
    const best = rotations.map((rotation) => {
      const top = candidateFundamentals(power, n, gridType, angles.map((angle) => angle + rotation), kMin, kMax)[0];
      return top ? { ...top, rotation } : null;
    });
    const level = best[ROTATION_STEPS]?.score ?? 0;
    return best
      .filter((hypothesis, i): hypothesis is SpectralHypothesis & { rotation: number } => {
        if (!hypothesis || i === ROTATION_STEPS || hypothesis.score <= level) return false;
        return hypothesis.score > (best[i - 1]?.score ?? 0) && hypothesis.score >= (best[i + 1]?.score ?? 0);
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 1);
  });
}
