/**
 * Automatic grid detection from the map image: spectral analysis proposes grid
 * types and rough cell sizes, the lattice fit makes each proposal precise, and the
 * proposal whose edges really sit on lines of the map wins.
 *
 * Many maps are printed with cells that are not regular: hexes a few percent too
 * tall, squares that are rectangles. No regular grid fits those, so where the
 * regular proposals do not settle the map, proposals of other aspects are fitted
 * too, and the result says how the map must be stretched for its grid to be regular.
 */

import type { AlignmentResult } from '../gridAlignmentMath';
import { grayFromCanvasSource } from './grayImage';
import type { GrayImage } from './grayImage';
import { firstRoundProposals, MIN_PERIOD, reducedForSecondRound, secondRoundProposals, spectraOf, spectrumFactor } from './gridProposals';
import type { Proposal, Spectra } from './gridProposals';
import type { GridType } from '../../grid/GridSystem';
import { latticeSupport } from './latticeFit';
import { refineFromReduced, refineGrid } from './refineGrid';
import type { RefinedGrid } from './refineGrid';
import type { DetectableMap } from '../mapImage/mapImageView';
import { isStretchableAspect, NO_STRETCH, sameStretch, stretchForAspect } from '../../grid/mapStretch';

export type { DetectableMap } from '../mapImage/mapImageView';

/** Longest side of the analysed image; larger maps are scaled down before detection. */
export const MAX_ANALYSIS_SIDE = 4096;
/** Support below which the map is reported as having no grid. */
const MIN_SUPPORT = 0.05;
/** A spectral peak may be a harmonic of the grid, so the half and the double of a supported size are fitted too. */
const HARMONIC_MULTIPLES = [2, 0.5];
/** Support at which a fit settles the grid type. */
const DECISIVE_SUPPORT = 0.5;
/** Sizes closer than this fraction are the same proposal. */
const SAME_SIZE_TOLERANCE = 0.03;
/** Aspects closer than this fraction are the same grid at other sizes. */
const SAME_ASPECT_TOLERANCE = 0.005;
/**
 * Every line of a doubled grid is a real line too, so among sizes measured with the same edge length the
 * smallest one within this fraction of the best wins. A halved grid has a line on only every other edge.
 */
const DENSER_GRID_PREFERENCE = 0.75;

/**
 * A grid a GM measured or placed by hand, for the map's lines to make exact: its type is kept, and
 * only sizes close to its own are looked at. Size and aspect as in `RefinedGrid`.
 */
export interface GridHint {
  gridType: GridType;
  cellSize: number;
  aspect: number;
}

/** How far the size found for a hint may lie from the hint's, as a fraction. */
const HINT_SIZE_RANGE = 0.13;
/** Sizes fitted for the hint itself: the lattice search reaches 3 % to either side of each. */
const HINT_SIZE_STEPS = [0, -0.05, 0.05, -0.1, 0.1];

function sameSize(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_SIZE_TOLERANCE * b;
}

function sameAspect(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_ASPECT_TOLERANCE * b;
}

/**
 * Fits every proposal the map's lines may support, strongest first, and keeps those they do.
 * `firstDecisive` ends at the first fit that settles the grid, where the sizes are known not to be harmonics of it.
 */
function fitProposals(image: GrayImage, proposals: Proposal[], minSize: number, maxSize: number, firstDecisive = false): RefinedGrid[] {
  const attempted: Proposal[] = [];
  const fits: RefinedGrid[] = [];
  let queue = [...proposals];

  while (queue.length > 0) {
    const { gridType, size, aspect, harmonicsLeft } = queue.shift()!;
    const isNew = !attempted.some((a) => a.gridType === gridType && sameAspect(a.aspect, aspect) && sameSize(a.size, size));
    if (!isNew || size < minSize || size > maxSize) continue;
    attempted.push({ gridType, size, aspect, harmonicsLeft });

    const refined = refineGrid(image, gridType, size, aspect);
    if (!refined || refined.support < MIN_SUPPORT || !isStretchableAspect(refined.aspect)) continue;
    fits.push(refined);
    if (harmonicsLeft > 0) {
      queue.push(...HARMONIC_MULTIPLES.map((multiple) => ({ gridType, size: refined.cellSize * multiple, aspect: refined.aspect, harmonicsLeft: harmonicsLeft - 1 })));
    }
    if (refined.support < DECISIVE_SUPPORT) continue;
    if (firstDecisive) break;
    // No other grid type can explain a map this well; only this type's sizes are still worth fitting.
    queue = queue.filter((proposal) => proposal.gridType === gridType);
  }
  return fits;
}

/**
 * The grid type and aspect of the strongest fit win (a regular grid, tried first, on a tie). Its sizes are
 * then re-scored against each other with one common edge length, which makes their supports comparable,
 * and the densest of the grids the map still supports is the answer.
 */
function chooseFit(image: GrayImage, fits: RefinedGrid[]): RefinedGrid {
  const best = fits.reduce((a, b) => (a.support >= b.support ? a : b));
  const bestType = best.gridType;
  const rivals = fits.filter((fit) => fit.gridType === bestType && sameAspect(fit.aspect, best.aspect));
  const edgeLength = Math.min(...rivals.map((fit) => fit.cellSize));
  const compared = rivals.map((fit) => ({ fit, support: latticeSupport(image, bestType, fit, edgeLength) }));
  const bestSupport = Math.max(...compared.map((c) => c.support));
  const contenders = compared.filter((c) => c.support >= DENSER_GRID_PREFERENCE * bestSupport);
  return contenders.reduce((densest, c) => (c.fit.cellSize < densest.fit.cellSize ? c : densest)).fit;
}

/**
 * Fits the second round's proposals. A large map is searched reduced, which costs a fraction, and
 * only what its lines support there is fitted on the map itself.
 */
function fitSecondRound(image: GrayImage, spectra: Spectra, proposals: Proposal[], minSize: number, maxSize: number, firstDecisive: boolean): RefinedGrid[] {
  const { image: reduced, factor } = reducedForSecondRound(image, spectra);
  if (factor === 1) return fitProposals(image, proposals, minSize, maxSize, firstDecisive);
  return fitProposals(reduced, proposals.map((p) => ({ ...p, size: p.size / factor })), minSize / factor, maxSize / factor, firstDecisive)
    .map((fit) => refineFromReduced(image, fit, factor))
    .filter((fit) => fit.support >= MIN_SUPPORT);
}

/**
 * Detects the grid in a luminance image. Sizes and offsets are in pixels of the squared-up image
 * (`RefinedGrid.aspect`), which for a regular grid is the image itself. With a `hint`, only grids
 * of its type and about its size are looked for.
 */
export function detectGridInImage(image: GrayImage, hint?: GridHint): RefinedGrid | null {
  const factor = spectrumFactor(image);
  const spectra = spectraOf(image);
  const minSize = hint ? hint.cellSize * (1 - HINT_SIZE_RANGE) : MIN_PERIOD * factor;
  const maxSize = hint ? hint.cellSize * (1 + HINT_SIZE_RANGE) : Math.min(image.width, image.height) / 3;
  const wanted = (proposals: Proposal[]): Proposal[] => (hint ? proposals.filter((p) => p.gridType === hint.gridType) : proposals);
  const hinted: Proposal[] = hint
    ? HINT_SIZE_STEPS.map((step) => ({ gridType: hint.gridType, size: hint.cellSize * (1 + step), aspect: hint.aspect, harmonicsLeft: 0 }))
    : [];

  // A hint's sizes all lie within a few percent of each other: the first that settles the grid is it.
  const firstDecisive = hint !== undefined;
  const fits = fitProposals(image, [...hinted, ...wanted(firstRoundProposals(spectra, factor))], minSize, maxSize, firstDecisive);
  // A regular grid that most of the map's lines agree with is the map's grid: only otherwise is a second round worth its time.
  if (!fits.some((fit) => fit.support >= DECISIVE_SUPPORT)) {
    fits.push(...fitSecondRound(image, spectra, wanted(secondRoundProposals(image, spectra, factor)), minSize, maxSize, firstDecisive));
  }
  return fits.length > 0 ? chooseFit(image, fits) : null;
}

interface ImageSize {
  width: number;
  height: number;
}

/** A map's luminance and the size of the image it was read from. */
export interface MapGray {
  image: GrayImage;
  size: ImageSize;
}

/** The map's luminance at up to `MAX_ANALYSIS_SIDE` a side, with the image's own size; null for a map too small or without pixels. */
export async function readMapGray(map: DetectableMap): Promise<MapGray | null> {
  const size = map.imageSize;
  if (!size || size.width < 64 || size.height < 64) return null;
  const bitmap = await map.overview(MAX_ANALYSIS_SIDE);
  if (!bitmap) return null;
  try {
    const image = grayFromCanvasSource(bitmap, bitmap.width, bitmap.height, MAX_ANALYSIS_SIDE);
    return image ? { image, size } : null;
  } finally {
    bitmap.close();
  }
}

/** Detects the grid of a map image and returns it in world coordinates. */
export async function detectGridFromMapImage(map: DetectableMap): Promise<AlignmentResult | null> {
  const read = await readMapGray(map);
  return read ? detectGridInMapGray(read.image, read.size) : null;
}

/**
 * Detects the grid in `image`, the luminance of a map image of `size` pixels, and returns it in the
 * world coordinates the map has once it is drawn with the result's `mapStretch`.
 */
export function detectGridInMapGray(image: GrayImage, size: ImageSize): AlignmentResult | null {
  const detected = detectGridInImage(image);
  return detected ? gridInWorld(detected, image, size) : null;
}

/**
 * Makes a grid measured or placed by hand exact. `candidates` are the grids the GM's input can stand
 * for, the likeliest first; each is looked for among the map's lines (its type, about its size), and
 * the one they support is returned in world coordinates like `detectGridInMapGray`: of sizes that are
 * multiples of each other the densest, as in detection, and a grid type further down the list only
 * where the types before it settled nothing. Null where the lines support none of them.
 */
export function snapGridToMapGray({ image, size }: MapGray, candidates: AlignmentResult[]): AlignmentResult | null {
  const mapPerPixel = size.width / image.width;
  const asked: GridHint[] = [];
  const fits: RefinedGrid[] = [];
  for (const rough of candidates) {
    if (!rough.gridType) continue;
    const stretch = rough.mapStretch ?? NO_STRETCH;
    const hint: GridHint = { gridType: rough.gridType, cellSize: rough.cellSize / (mapPerPixel * stretch.x), aspect: stretch.x / stretch.y };
    // Readings of one measurement often name the same grid at another place: the lines place it either way.
    const isNew = !asked.some((a) => a.gridType === hint.gridType && sameAspect(a.aspect, hint.aspect) && sameSize(a.cellSize, hint.cellSize));
    if (!isNew) continue;
    if (fits.some((fit) => fit.gridType !== hint.gridType && fit.support >= DECISIVE_SUPPORT)) break;
    asked.push(hint);
    const detected = detectGridInImage(image, hint);
    if (detected) fits.push(detected);
  }
  return fits.length > 0 ? gridInWorld(chooseFit(image, fits), image, size) : null;
}

/** A grid found in the luminance `image` of a map image of `size` pixels, as the world sees it. */
function gridInWorld(detected: RefinedGrid, image: GrayImage, size: ImageSize): AlignmentResult {
  const mapPerPixel = size.width / image.width;
  const stretch = stretchForAspect(detected.aspect);
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  // Detected offsets index pixels; a pixel's centre is half a pixel further in continuous image space.
  return {
    gridType: detected.gridType,
    cellSize: round2(detected.cellSize * mapPerPixel * stretch.x),
    offsetX: round2((detected.offsetX + 0.5) * mapPerPixel * stretch.x),
    offsetY: round2((detected.offsetY * detected.aspect + 0.5) * mapPerPixel * stretch.y),
    confidence: round2(detected.support),
    ...(sameStretch(stretch, NO_STRETCH) ? {} : { mapStretch: stretch }),
  };
}
