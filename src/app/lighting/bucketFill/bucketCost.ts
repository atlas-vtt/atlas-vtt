import { srgbToLinear } from '../srgb';

/**
 * What it costs a bucket's flood to enter each pixel of a painted map: how strong an edge lies
 * there (walls are the strongest, floor texture and a printed grid weak once blurred), plus how
 * unlike the floor where the bucket was dropped it looks (a dark map's void, which a weak spot in a
 * wall would otherwise let the flood into). Distances are in OpenCV's 8-bit Lab scale (L 0–255),
 * the scale the prototype was tuned in.
 */

/** An RGBA image, row by row (`ImageData`). */
export interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** How unlike the floor a pixel may be before it costs (8-bit Lab), and what each unit beyond costs. */
const COLOUR_TOLERANCE = 25;
const COLOUR_WEIGHT = 0.5;

const LUT = Float64Array.from({ length: 256 }, (_, v) => srgbToLinear(v / 255));

/**
 * Where a result must be exact: within `limit` pixels of the places a bucket is poured at (`toSeed`,
 * squared distances). A long drag's window is mostly far from its path, and nothing there counts.
 */
export interface Near {
  toSeed: Float64Array;
  limit: number;
}

/** Whether pixel `i` lies within `limit` of the seeds; every pixel without `near`. */
const within = (near: Near | undefined, i: number, limit = near?.limit ?? 0): boolean => !near || near.toSeed[i]! <= limit * limit;

/** Per line (rows, or columns), the first and past-last pixel within `limit` of the seeds: a span that holds all of them. */
function spans(near: Near, width: number, height: number, limit: number, rows: boolean): Int32Array {
  const [n, count] = rows ? [width, height] : [height, width];
  const span = new Int32Array(2 * count);
  const [base, step] = rows ? [width, 1] : [1, width];
  const squared = limit * limit;
  for (let j = 0; j < count; j++) {
    let lo = n;
    let hi = 0;
    for (let k = 0; k < n; k++) {
      if (near.toSeed[j * base + k * step]! <= squared) {
        lo = Math.min(lo, k);
        hi = k + 1;
      }
    }
    span[2 * j] = lo;
    span[2 * j + 1] = hi;
  }
  return span;
}

/**
 * Separable Gaussian blur of `channels` interleaved float channels, in place: each line is copied
 * into a buffer padded with its end values, so the taps need no bounds. With `near`, exact only
 * there, which needs the input exact within `limit` + twice the blur's radius.
 */
export function blur(values: Float32Array, width: number, height: number, channels: number, sigma: number, near?: Near): void {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const taps = 2 * radius + 1;
  const kernel = new Float32Array(taps);
  for (let i = 0; i < taps; i++) kernel[i] = Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma));
  const sum = kernel.reduce((a, b) => a + b, 0);
  for (let i = 0; i < taps; i++) kernel[i]! /= sum;
  const line = new Float32Array((Math.max(width, height) + 2 * radius) * channels);
  // `count` lines of `n` values, line j starting at j * `lineStride`, its values `step` apart, blurred within `span`.
  const pass = (n: number, count: number, lineStride: number, step: number, span: Int32Array | null): void => {
    for (let j = 0; j < count; j++) {
      const [lo, hi] = span ? [span[2 * j]!, span[2 * j + 1]!] : [0, n];
      const base = j * lineStride;
      for (let k = lo - radius; k < hi + radius; k++) {
        const from = base + Math.min(n - 1, Math.max(0, k)) * step;
        for (let c = 0; c < channels; c++) line[(k - lo + radius) * channels + c] = values[from + c]!;
      }
      for (let k = lo; k < hi; k++) {
        for (let c = 0; c < channels; c++) {
          let acc = 0;
          for (let t = 0, at = (k - lo) * channels + c; t < taps; t++, at += channels) acc += kernel[t]! * line[at]!;
          values[base + k * step + c] = acc;
        }
      }
    }
  };
  // The rows reach the blur's radius further, as the columns read that far along them.
  pass(width, height, width * channels, channels, near ? spans(near, width, height, near.limit + radius, true) : null);
  pass(height, width, channels, width * channels, near ? spans(near, width, height, near.limit, false) : null);
}

/** The image blurred by `sigma` pixels and in 8-bit Lab, three floats a pixel; with `near`, only there (0 elsewhere). */
export function blurredLab({ data, width, height }: Rgba, sigma: number, near?: Near): Float32Array {
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i]!;
    rgb[j + 1] = data[i + 1]!;
    rgb[j + 2] = data[i + 2]!;
  }
  blur(rgb, width, height, 3, sigma, near);
  const lab = new Float32Array(rgb.length);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let j = 0; j < rgb.length; j += 3) {
    if (!within(near, j / 3)) continue;
    const r = LUT[Math.round(rgb[j]!)]!;
    const g = LUT[Math.round(rgb[j + 1]!)]!;
    const b = LUT[Math.round(rgb[j + 2]!)]!;
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    lab[j] = (116 * fy - 16) * 2.55;
    lab[j + 1] = 500 * (fx - fy);
    lab[j + 2] = 200 * (fy - fz);
  }
  return lab;
}

/**
 * Edge strength: the Sobel gradient over all three Lab channels (a quarter of it), softened by a
 * small blur. With `near`, exact only there, which needs `lab` exact within `limit` + 8.
 */
export function edgeStrength(lab: Float32Array, width: number, height: number, near?: Near): Float32Array {
  const grad = new Float32Array(width * height);
  // What the blur reads: within twice its radius (3) of where it must be exact.
  const sobelLimit = (near?.limit ?? 0) + 6;
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      if (!within(near, row + x, sobelLimit)) continue;
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      let sum = 0;
      for (let c = 0; c < 3; c++) {
        const ul = lab[(up + left) * 3 + c]!, u = lab[(up + x) * 3 + c]!, ur = lab[(up + right) * 3 + c]!;
        const l = lab[(row + left) * 3 + c]!, r = lab[(row + right) * 3 + c]!;
        const dl = lab[(down + left) * 3 + c]!, d = lab[(down + x) * 3 + c]!, dr = lab[(down + right) * 3 + c]!;
        const gx = ur + 2 * r + dr - ul - 2 * l - dl;
        const gy = dl + 2 * d + dr - ul - 2 * u - ur;
        sum += gx * gx + gy * gy;
      }
      grad[row + x] = Math.sqrt(sum) / 4;
    }
  }
  blur(grad, width, height, 1, 0.8, near);
  return grad;
}

/** The calmest pixel within `reach` of `seed`, so a drop on a prop pours from the floor beside it. */
export function calmestNear(grad: Float32Array, width: number, height: number, seed: { x: number; y: number }, reach: number): { x: number; y: number } {
  let best = seed;
  let lowest = Infinity;
  for (let y = Math.max(2, seed.y - reach); y <= Math.min(height - 3, seed.y + reach); y++) {
    for (let x = Math.max(2, seed.x - reach); x <= Math.min(width - 3, seed.x + reach); x++) {
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += grad[(y + dy) * width + x + dx]!;
      if (sum < lowest) [lowest, best] = [sum, { x, y }];
    }
  }
  return best;
}

/** Edge strength plus what each pixel's unlikeness to the floor around `seeds` (squares `half` pixels each way) costs. */
export function floodCost(lab: Float32Array, grad: Float32Array, width: number, height: number, seeds: readonly { x: number; y: number }[], half: number): Float32Array {
  const channels = [0, 1, 2].map(() => new Float32Array(seeds.length * 4 * half * half));
  let count = 0;
  for (const seed of seeds) {
    for (let y = Math.max(0, seed.y - half); y < Math.min(height, seed.y + half); y++) {
      for (let x = Math.max(0, seed.x - half); x < Math.min(width, seed.x + half); x++, count++) {
        for (let c = 0; c < 3; c++) channels[c]![count] = lab[(y * width + x) * 3 + c]!;
      }
    }
  }
  const floor = channels.map((values) => values.subarray(0, count).sort()[count >> 1] ?? 0);
  const cost = new Float32Array(width * height);
  for (let i = 0; i < cost.length; i++) {
    const unlike = Math.sqrt((lab[i * 3]! - floor[0]!) ** 2 + (lab[i * 3 + 1]! - floor[1]!) ** 2 + (lab[i * 3 + 2]! - floor[2]!) ** 2);
    cost[i] = grad[i]! + COLOUR_WEIGHT * Math.max(0, unlike - COLOUR_TOLERANCE);
  }
  return cost;
}
