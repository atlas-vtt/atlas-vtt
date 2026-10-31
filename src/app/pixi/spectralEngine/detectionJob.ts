/**
 * One grid detection from start to answer, with what it has to show on the way. It runs in the
 * detection worker, or on the main thread where no worker can start (`SpectralEngineClient`), and
 * touches neither a document nor PIXI.
 */

import type { AlignmentResult } from '../gridAlignmentMath';
import { detectGridInImage, gridInWorld, snapGridInMapGray, worldPlaceOf } from './detectGrid';
import type { DetectionWatch, MapGray } from './detectGrid';
import { downsampleGray, lineContrast } from './grayImage';
import type { GrayImage } from './grayImage';
import { edgesOnLines } from './latticeFit';
import type { RefinedGrid } from './refineGrid';

export interface DetectionJob {
  gray: MapGray;
  /** The grids a measurement or placement can stand for, the likeliest first; without them the whole map is searched. */
  candidates?: AlignmentResult[];
  /** Whether the map's line evidence is wanted, which costs a moment before the search begins. */
  ink: boolean;
  /** Whether where the map's lines lie is wanted (`LineEnergy`), for the windows a huge map is searched in. */
  lines?: boolean;
}

/** How much line evidence each block of the analysed image holds, row-major, for choosing where to look closer. */
export interface LineEnergy {
  cols: number;
  rows: number;
  /** Pixels of the analysed image a block spans. */
  block: number;
  data: Float32Array;
}

/** The lines of a map, whatever they belong to, as strengths of 0–255 over the whole image. */
export interface InkMap {
  width: number;
  height: number;
  data: Uint8Array;
}

export type DetectionEvent =
  | { type: 'ink'; ink: InkMap }
  /** A grid the map's lines support, in the world it would give the map (`gridInWorld`). */
  | { type: 'fit'; fit: AlignmentResult }
  /** A grid the detection tries on the map next: its type, size and shape, at no place yet. */
  | { type: 'trial'; trial: AlignmentResult };

export interface DetectionOutcome {
  result: AlignmentResult | null;
  /** The edges of the result's grid that lie on lines of the map, four numbers each (x1, y1, x2, y2) in the result's world. */
  hits: Float32Array | null;
  /** Where the map's lines lie, when asked for (`DetectionJob.lines`). */
  lines?: LineEnergy;
}

/** A detection that found no grid. */
export const NO_GRID: DetectionOutcome = { result: null, hits: null };

/** Longest side of the ink map: it is shown as a glow, never read. */
const INK_SIDE = 768;
/** Flank distance of the ink's line evidence, in its own pixels. */
const INK_FLANK = 2;
/** Strengths are scaled so that this share of the pixels is below full strength: a faint grid shows beside heavy ink. */
const INK_FULL_SHARE = 0.99;
/** The strengths from 0 to the strongest are counted in this many bins to find that share. */
const INK_BINS = 1024;

/** How many of the bins, counted from the weakest, hold `INK_FULL_SHARE` of `data`, whose strongest value is `max`. */
function binsBelowFull(data: Float32Array, max: number): number {
  const bins = new Uint32Array(INK_BINS);
  for (const value of data) bins[Math.min(INK_BINS - 1, Math.floor((value / max) * INK_BINS))]!++;
  let seen = 0;
  for (let bin = 0; bin < INK_BINS; bin++) {
    seen += bins[bin]!;
    if (seen >= data.length * INK_FULL_SHARE) return bin + 1;
  }
  return INK_BINS;
}

/** Pixels of the analysed image one block of the line energy spans: a 4096 px picture gives 16 × 16 blocks. */
const ENERGY_BLOCK = 256;

/** The line evidence of `image` summed per block of `ENERGY_BLOCK` pixels; partial blocks at the edges count what they have, scaled up. */
export function lineEnergyOf(image: GrayImage): LineEnergy {
  const { width, height, data } = lineContrast(image, INK_FLANK);
  const cols = Math.max(1, Math.ceil(width / ENERGY_BLOCK));
  const rows = Math.max(1, Math.ceil(height / ENERGY_BLOCK));
  const sums = new Float32Array(cols * rows);
  const counts = new Float32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / ENERGY_BLOCK) * cols;
    for (let x = 0; x < width; x++) {
      const at = row + Math.floor(x / ENERGY_BLOCK);
      sums[at] = sums[at]! + data[y * width + x]!;
      counts[at] = counts[at]! + 1;
    }
  }
  const full = ENERGY_BLOCK * ENERGY_BLOCK;
  for (let i = 0; i < sums.length; i++) sums[i] = counts[i]! > 0 ? (sums[i]! * full) / counts[i]! : 0;
  return { cols, rows, block: ENERGY_BLOCK, data: sums };
}

/** The line evidence of `image`, reduced and scaled to bytes. */
export function inkOf(image: GrayImage): InkMap {
  const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / INK_SIDE));
  const { width, height, data } = lineContrast(downsampleGray(image, factor), INK_FLANK);
  const ink = new Uint8Array(data.length);
  let max = 0;
  for (const value of data) if (value > max) max = value;
  if (max === 0) return { width, height, data: ink };

  const scale = (255 * INK_BINS) / (binsBelowFull(data, max) * max);
  for (let i = 0; i < data.length; i++) ink[i] = Math.min(255, data[i]! * scale);
  return { width, height, data: ink };
}

/** The edges of `grid` that have a line of the map under them, four numbers each, in the world of its result. */
function hitsOf(grid: RefinedGrid, { image, size }: MapGray): Float32Array {
  const { onLine } = edgesOnLines(image, grid.gridType, grid);
  const world = worldPlaceOf(grid, image, size);
  const hits = new Float32Array(onLine.size * 4);
  let at = 0;
  for (const edge of onLine) {
    const from = world(edge.x1, edge.y1);
    const to = world(edge.x2, edge.y2);
    hits.set([from.x, from.y, to.x, to.y], at);
    at += 4;
  }
  return hits;
}

/** Fits `candidates` to the map's lines, or searches the whole map without them; `emit` hears what turns up on the way. */
export function runDetection({ gray, candidates, ink, lines }: DetectionJob, emit: (event: DetectionEvent) => void): DetectionOutcome {
  if (ink) emit({ type: 'ink', ink: inkOf(gray.image) });
  const energy = lines ? { lines: lineEnergyOf(gray.image) } : {};
  const inWorld = (grid: RefinedGrid): AlignmentResult => gridInWorld(grid, gray.image, gray.size);
  const watch: DetectionWatch = {
    tried: ({ gridType, size, aspect, rotation = 0 }) => emit({ type: 'trial', trial: inWorld({ gridType, cellSize: size, offsetX: 0, offsetY: 0, aspect, rotation, support: 0 }) }),
    fitted: (fit) => emit({ type: 'fit', fit: inWorld(fit) }),
  };
  const grid = candidates ? snapGridInMapGray(gray, candidates, watch) : detectGridInImage(gray.image, undefined, watch);
  return grid ? { result: gridInWorld(grid, gray.image, gray.size), hits: hitsOf(grid, gray), ...energy } : { ...NO_GRID, ...energy };
}
