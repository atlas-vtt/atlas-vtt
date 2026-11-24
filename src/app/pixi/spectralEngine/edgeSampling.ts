/**
 * The innermost loop of grid detection: the image sampled across an edge at points along it, which
 * a detection does some hundred million times. Every point takes the arithmetic of `sampleBilinear`
 * step for step, so the sums are the same to the last bit. An upright edge of a level map crosses
 * the same image columns at every point along it, and a level edge the same rows: where those
 * columns or rows lie is worked out once per edge instead of once per point.
 */

import type { GrayImage } from './grayImage';
import type { LatticeEdge, LatticeFrame } from './edgeProfile';

/** Where an edge's points are taken and summed (`edgeResponse`). */
export interface EdgeSampling {
  /** Points across the edge at each point along it, `step` apart; the point at `first` lies on the edge. */
  width: number;
  first: number;
  step: number;
  /** Points along the edge, spread evenly over all but `trim` of its length at either end. */
  count: number;
  trim: number;
  /** The points along the edge fall into this many pieces of `width` sums each. */
  pieces: number;
}

/** Image columns (or rows) of the points across an edge, and how far into them each point lies; kept between edges. */
let cells = new Int32Array(0);
let fractions = new Float64Array(0);

function crossings(length: number): void {
  if (cells.length >= length) return;
  cells = new Int32Array(length);
  fractions = new Float64Array(length);
}

/**
 * Sums the image at every point of `sampling` into `profiles` (a row of `width` per piece), where the
 * edge is upright or level on a level map; false, with nothing summed, for any other edge.
 */
export function addStraightEdgeSamples(image: GrayImage, edge: LatticeEdge, frame: LatticeFrame, sampling: EdgeSampling, profiles: Float32Array): boolean {
  if (frame.sin !== 0) return false;
  if (edge.ny === 0 && edge.x2 - edge.x1 === 0) addUprightEdge(image, edge, frame.aspect, sampling, profiles);
  else if (edge.nx === 0 && edge.y2 - edge.y1 === 0) addLevelEdge(image, edge, frame.aspect, sampling, profiles);
  else return false;
  return true;
}

/** The share of the edge's length at which its `i`-th point along it lies, as `edgeResponse` places it. */
function along({ trim, count }: EdgeSampling, i: number): number {
  return trim + ((1 - 2 * trim) * (i + 0.5)) / count;
}

/** An upright edge of a level map: its normal runs level, so every point along it crosses the same image columns. */
function addUprightEdge(image: GrayImage, edge: LatticeEdge, aspect: number, sampling: EdgeSampling, profiles: Float32Array): void {
  const { width: imageWidth, height, data } = image;
  const { count, pieces, width, first, step } = sampling;
  const { x1, y1, nx } = edge;
  const dy = edge.y2 - y1;
  // `x1 + 0 * t`, the same at every point along the edge.
  const px = x1 + (edge.x2 - x1) * along(sampling, 0);
  crossings(width);
  for (let j = 0; j < width; j++) {
    const x = px + nx * ((j - first) * step);
    const x0 = Math.floor(x);
    // Off the image `sampleBilinear` gives 0, which adds nothing.
    cells[j] = x0 < 0 || x0 + 1 >= imageWidth ? -1 : x0;
    fractions[j] = x - x0;
  }
  for (let i = 0; i < count; i++) {
    // `(py + ny * d) * aspect` with `ny` 0.
    const y = (y1 + dy * along(sampling, i)) * aspect;
    const y0 = Math.floor(y);
    if (y0 < 0 || y0 + 1 >= height) continue;
    const fy = y - y0;
    const base = y0 * imageWidth;
    const row = Math.floor((i * pieces) / count) * width;
    for (let j = 0; j < width; j++) {
      const x0 = cells[j]!;
      if (x0 < 0) continue;
      const fx = fractions[j]!;
      const at = base + x0;
      const top = data[at]! * (1 - fx) + data[at + 1]! * fx;
      const bottom = data[at + imageWidth]! * (1 - fx) + data[at + imageWidth + 1]! * fx;
      profiles[row + j] = profiles[row + j]! + (top * (1 - fy) + bottom * fy);
    }
  }
}

/** A level edge of a level map: its normal runs upright, so every point along it crosses the same image rows. */
function addLevelEdge(image: GrayImage, edge: LatticeEdge, aspect: number, sampling: EdgeSampling, profiles: Float32Array): void {
  const { width: imageWidth, height, data } = image;
  const { count, pieces, width, first, step } = sampling;
  const { x1, y1, ny } = edge;
  const dx = edge.x2 - x1;
  // `y1 + 0 * t`, the same at every point along the edge.
  const py = y1 + (edge.y2 - y1) * along(sampling, 0);
  crossings(width);
  for (let j = 0; j < width; j++) {
    const y = (py + ny * ((j - first) * step)) * aspect;
    const y0 = Math.floor(y);
    cells[j] = y0 < 0 || y0 + 1 >= height ? -1 : y0 * imageWidth;
    fractions[j] = y - y0;
  }
  for (let i = 0; i < count; i++) {
    // `px + nx * d` with `nx` 0.
    const x = x1 + dx * along(sampling, i);
    const x0 = Math.floor(x);
    if (x0 < 0 || x0 + 1 >= imageWidth) continue;
    const fx = x - x0;
    const row = Math.floor((i * pieces) / count) * width;
    for (let j = 0; j < width; j++) {
      const base = cells[j]!;
      if (base < 0) continue;
      const fy = fractions[j]!;
      const at = base + x0;
      const top = data[at]! * (1 - fx) + data[at + 1]! * fx;
      const bottom = data[at + imageWidth]! * (1 - fx) + data[at + imageWidth + 1]! * fx;
      profiles[row + j] = profiles[row + j]! + (top * (1 - fy) + bottom * fy);
    }
  }
}
