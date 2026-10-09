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
import { firstRoundProposals, MIN_PERIOD, reducedImage, secondRoundFactor, secondRoundProposals, spectraOf, spectrumFactor } from './gridProposals';
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

/** A proposal with an exact size is the same attempt only as one that began this much nearer than rough proposals may lie. */
const EXACT_PROPOSAL = 1 / 6;

/**
 * Whether fitting `proposal` would repeat `earlier`. The half or double of a supported fit is exact:
 * a rough proposal near it that found nothing (its aspect a little off) says nothing about it.
 */
function isSameAttempt(earlier: Proposal, proposal: Proposal): boolean {
  if (earlier.gridType !== proposal.gridType) return false;
  const closeness = proposal.fromFit ? EXACT_PROPOSAL : 1;
  return Math.abs(earlier.aspect - proposal.aspect) < SAME_ASPECT_TOLERANCE * closeness * proposal.aspect
    && Math.abs(earlier.size - proposal.size) < SAME_SIZE_TOLERANCE * closeness * proposal.size;
}

/**
 * A grid is looked for where its cells are about this many pixels. Lines, the windows they are
 * measured in and what an aspect a little off does to them all grow with the cell, so a map of 300 px
 * hexes with lines of six pixels is searched reduced, like the same map at a third of its size, and
 * what is found there is fitted on the map itself.
 */
const SEARCH_CELL_SIZE = 96;

interface Round {
  /** Sizes outside this range are not fitted. */
  minSize: number;
  maxSize: number;
  /** Ends at the first fit that settles the grid, where the sizes are known not to be harmonics of it. */
  firstDecisive: boolean;
  /** The image is reduced at least this many times before it is searched. */
  minFactor: number;
}

/** The grid of a proposal, searched at the scale of its cells and fitted on the image itself; null where the lines support none. */
function fitProposal(image: GrayImage, spectra: Spectra, { gridType, size, aspect }: Proposal, minFactor: number): RefinedGrid | null {
  const factor = Math.max(minFactor, Math.floor(size / SEARCH_CELL_SIZE));
  if (factor <= 1) return refineGrid(image, gridType, size, aspect);
  const reduced = refineGrid(reducedImage(image, spectra, factor), gridType, size / factor, aspect);
  return reduced && reduced.support >= MIN_SUPPORT ? refineFromReduced(image, reduced, factor) : null;
}

/** Fits every proposal the map's lines may support, strongest first, and keeps those they do. */
function fitProposals(image: GrayImage, spectra: Spectra, proposals: Proposal[], { minSize, maxSize, firstDecisive, minFactor }: Round): RefinedGrid[] {
  const attempted: Proposal[] = [];
  const fits: RefinedGrid[] = [];
  let queue = [...proposals];

  while (queue.length > 0) {
    const proposal = queue.shift()!;
    const { gridType, size, harmonicsLeft } = proposal;
    if (attempted.some((earlier) => isSameAttempt(earlier, proposal)) || size < minSize || size > maxSize) continue;
    attempted.push(proposal);

    const refined = fitProposal(image, spectra, proposal, minFactor);
    if (!refined || refined.support < MIN_SUPPORT || !isStretchableAspect(refined.aspect)) continue;
    fits.push(refined);
    if (harmonicsLeft > 0) {
      queue.push(...HARMONIC_MULTIPLES.map((multiple): Proposal => ({ gridType, size: refined.cellSize * multiple, aspect: refined.aspect, harmonicsLeft: harmonicsLeft - 1, fromFit: true })));
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
  const round: Round = { minSize, maxSize, firstDecisive: hint !== undefined, minFactor: 1 };
  const fits = fitProposals(image, spectra, [...hinted, ...wanted(firstRoundProposals(spectra, factor))], round);
  // A regular grid that most of the map's lines agree with is the map's grid: only otherwise is a second round worth its time.
  if (!fits.some((fit) => fit.support >= DECISIVE_SUPPORT)) {
    // A large map is searched reduced, which costs a fraction; what its lines support there is fitted on the map itself.
    fits.push(...fitProposals(image, spectra, wanted(secondRoundProposals(image, spectra, factor)), { ...round, minFactor: secondRoundFactor(image) }));
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
