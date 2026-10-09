/**
 * Automatic grid detection from the map image: spectral analysis proposes grid
 * types and rough cell sizes, the lattice fit makes each proposal precise, and the
 * proposal whose edges really sit on lines of the map wins.
 */

import type { AlignmentResult } from '../gridAlignmentMath';
import { powerSpectrum2D } from './fft';
import { downsampleGray, grayFromCanvasSource, localContrast, toWindowedSquare } from './grayImage';
import type { GrayImage } from './grayImage';
import { spectralHypotheses } from './spectralHypotheses';
import type { SpectralHypothesis } from './spectralHypotheses';
import type { GridType } from '../../grid/GridSystem';
import { latticeSupport } from './latticeFit';
import { refineGrid } from './refineGrid';
import type { RefinedGrid } from './refineGrid';
import type { PixelRect } from '../mapImage/pyramid';
import type { DetectableMap } from '../mapImage/mapImageView';

export type { DetectableMap } from '../mapImage/mapImageView';

const SPECTRUM_SIZE = 512;
/** Plausible line spacing in spectrum pixels. */
const MIN_PERIOD = 4;
const MAX_PERIOD = SPECTRUM_SIZE / 4;
/** Longest side of the analysed image; larger maps are scaled down before detection. */
export const MAX_ANALYSIS_SIDE = 4096;
/** Support below which the map is reported as having no grid. */
const MIN_SUPPORT = 0.05;
/** A spectral peak may be a harmonic of the grid, so the half and the double of a supported size are fitted too. */
const HARMONIC_MULTIPLES = [2, 0.5];
const HARMONIC_DEPTH = 2;
/** Support at which a fit settles the grid type. */
const DECISIVE_SUPPORT = 0.5;
/** Sizes closer than this fraction are the same proposal. */
const SAME_SIZE_TOLERANCE = 0.03;
/**
 * Every line of a doubled grid is a real line too, so among sizes measured with the same edge length the
 * smallest one within this fraction of the best wins. A halved grid has a line on only every other edge.
 */
const DENSER_GRID_PREFERENCE = 0.75;

interface Proposal {
  gridType: GridType;
  size: number;
  /** How many more times a supported fit of this proposal may queue its half and double. */
  harmonicsLeft: number;
}

/** Grid hypotheses the spectrum of one view of the image suggests. */
function spectralProposals(view: GrayImage): SpectralHypothesis[] {
  const spectrum = powerSpectrum2D(toWindowedSquare(view, SPECTRUM_SIZE), SPECTRUM_SIZE);
  return spectralHypotheses(spectrum, SPECTRUM_SIZE, MIN_PERIOD, MAX_PERIOD);
}

/** Fits every proposal the map's lines may support, strongest first, and keeps those they do. */
function fitProposals(image: GrayImage, proposals: Proposal[], minSize: number, maxSize: number): RefinedGrid[] {
  const attempted: Proposal[] = [];
  const fits: RefinedGrid[] = [];
  let queue = [...proposals];

  while (queue.length > 0) {
    const { gridType, size, harmonicsLeft } = queue.shift()!;
    const isNew = !attempted.some((a) => a.gridType === gridType && Math.abs(a.size - size) < SAME_SIZE_TOLERANCE * size);
    if (!isNew || size < minSize || size > maxSize) continue;
    attempted.push({ gridType, size, harmonicsLeft });

    const refined = refineGrid(image, gridType, size);
    if (!refined || refined.support < MIN_SUPPORT) continue;
    fits.push(refined);
    if (harmonicsLeft > 0) queue.push(...HARMONIC_MULTIPLES.map((multiple) => ({ gridType, size: refined.cellSize * multiple, harmonicsLeft: harmonicsLeft - 1 })));
    // No other grid type can explain a map this well; only this type's sizes are still worth fitting.
    if (refined.support >= DECISIVE_SUPPORT) queue = queue.filter((proposal) => proposal.gridType === gridType);
  }
  return fits;
}

/**
 * The grid type of the strongest fit wins. Its sizes are then re-scored against each
 * other with one common edge length, which makes their supports comparable, and the
 * densest of the grids the map still supports is the answer.
 */
function chooseFit(image: GrayImage, fits: RefinedGrid[]): RefinedGrid {
  const bestType = fits.reduce((a, b) => (a.support >= b.support ? a : b)).gridType;
  const rivals = fits.filter((fit) => fit.gridType === bestType);
  const edgeLength = Math.min(...rivals.map((fit) => fit.cellSize));
  const compared = rivals.map((fit) => ({ fit, support: latticeSupport(image, bestType, fit, edgeLength) }));
  const bestSupport = Math.max(...compared.map((c) => c.support));
  const contenders = compared.filter((c) => c.support >= DENSER_GRID_PREFERENCE * bestSupport);
  return contenders.reduce((densest, c) => (c.fit.cellSize < densest.fit.cellSize ? c : densest)).fit;
}

/** Detects the grid in a luminance image. Coordinates and sizes are in image pixels. */
export function detectGridInImage(image: GrayImage): RefinedGrid | null {
  const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / SPECTRUM_SIZE));
  // Thin lines only survive when their contrast is taken before the image is reduced, lines of a few
  // pixels only show up as lines afterwards: both views propose, the lattice fit decides.
  const views = [downsampleGray(localContrast(image, 1), factor), localContrast(downsampleGray(image, factor), 1)];
  // Strongest spectral proposals first; every supported fit queues its half and its double.
  const proposals: Proposal[] = views
    .flatMap(spectralProposals)
    .sort((a, b) => b.score - a.score)
    .map((h) => ({ gridType: h.gridType, size: h.cellSize * factor, harmonicsLeft: HARMONIC_DEPTH }));

  const fits = fitProposals(image, proposals, MIN_PERIOD * factor, Math.min(image.width, image.height) / 3);
  return fits.length > 0 ? chooseFit(image, fits) : null;
}

/** The map's luminance at up to `MAX_ANALYSIS_SIDE` a side; null for a map too small or without pixels. */
async function readMapGray(map: DetectableMap): Promise<{ image: GrayImage; rect: PixelRect } | null> {
  const rect = map.worldRect;
  if (!rect || rect.width < 64 || rect.height < 64) return null;
  const bitmap = await map.overview(MAX_ANALYSIS_SIDE);
  if (!bitmap) return null;
  try {
    const image = grayFromCanvasSource(bitmap, bitmap.width, bitmap.height, MAX_ANALYSIS_SIDE);
    return image ? { image, rect } : null;
  } finally {
    bitmap.close();
  }
}

/** Detects the grid of a map image and returns it in world coordinates. */
export async function detectGridFromMapImage(map: DetectableMap): Promise<AlignmentResult | null> {
  const read = await readMapGray(map);
  return read ? detectGridInMapGray(read.image, read.rect) : null;
}

/** Detects the grid in `image`, the luminance of the map that covers `rect`, and returns it in world coordinates. */
export function detectGridInMapGray(image: GrayImage, rect: PixelRect): AlignmentResult | null {
  const detected = detectGridInImage(image);
  if (!detected) return null;

  const worldPerPixel = rect.width / image.width;
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  // Detected offsets index pixels; a pixel's centre is half a pixel further in continuous world space.
  return {
    gridType: detected.gridType,
    cellSize: round2(detected.cellSize * worldPerPixel),
    offsetX: round2(rect.x + (detected.offsetX + 0.5) * worldPerPixel),
    offsetY: round2(rect.y + (detected.offsetY + 0.5) * worldPerPixel),
    confidence: round2(detected.support),
  };
}
