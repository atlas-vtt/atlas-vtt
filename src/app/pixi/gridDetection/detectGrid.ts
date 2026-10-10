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
import { isFinerCopy } from './subGrid';
import { refineFromReduced, refineGrid } from './refineGrid';
import type { RefinedGrid } from './refineGrid';
import type { DetectableMap } from '../mapImage/mapImageView';
import { isStretchableAspect, MAX_ROTATION_DEGREES, NO_STRETCH, sameStretch, stretchForAspect, turnedBox } from '../../grid/mapStretch';

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
  rotation: number;
}

/** A GM who measures a grid says that there is one, of that type and about that size: far less of it on the map's lines confirms it. */
const MIN_HINTED_SUPPORT = 0.02;
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

/** A fit that turns the map further than a scan lies askew found no grid. */
const MAX_ROTATION = (MAX_ROTATION_DEGREES * Math.PI) / 180;
/** Angles closer than this are the same grid at other sizes. */
const SAME_ROTATION = 0.002;

/** A proposal with an exact size is the same attempt only as one that began this much nearer than rough proposals may lie. */
const EXACT_PROPOSAL = 1 / 6;

/**
 * Whether fitting `proposal` would repeat `earlier`. The half or double of a supported fit is exact:
 * a rough proposal near it that found nothing (its aspect a little off) says nothing about it.
 */
function isSameAttempt(earlier: Proposal, proposal: Proposal): boolean {
  if (earlier.gridType !== proposal.gridType || Math.abs((earlier.rotation ?? 0) - (proposal.rotation ?? 0)) >= SAME_ROTATION) return false;
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
  /** Support below which a fit found no grid. */
  minSupport: number;
}

/**
 * The lines of a square grid run on across the map, so a real one is also found by edges of this
 * length (a quarter of the map's shorter side where that is less), which see fainter lines than
 * edges of one cell. What only looks like a grid cell by cell (floor boards, tiles, shelves) is not
 * on one lattice over such a stretch.
 */
const LONG_EDGE = 400;

function longEdge(image: GrayImage, cellSize: number): number {
  return Math.max(cellSize, Math.min(LONG_EDGE, Math.min(image.width, image.height) / 4));
}

/**
 * The support a fit is accepted on. A square grid must show on long edges too, and counts with the
 * better of the two: a grid drawn by hand on the floors of a dungeon has few single cells on its
 * lines and many long stretches. Hex lines turn at every corner, so a hex grid has its cells' edges only.
 */
function acceptedSupport(image: GrayImage, fit: RefinedGrid): number {
  if (fit.gridType !== 'square') return fit.support;
  const long = latticeSupport(image, fit.gridType, fit, longEdge(image, fit.cellSize));
  return long > 0 ? Math.max(fit.support, long) : 0;
}

/** The grid of a proposal, searched at the scale of its cells and fitted on the image itself; null where the lines support none. */
function fitProposal(image: GrayImage, spectra: Spectra, { gridType, size, aspect, rotation }: Proposal, minFactor: number): RefinedGrid | null {
  const factor = Math.max(minFactor, Math.floor(size / SEARCH_CELL_SIZE));
  if (factor <= 1) return refineGrid(image, gridType, size, aspect, rotation);
  const small = reducedImage(image, spectra, factor);
  const reduced = refineGrid(small, gridType, size / factor, aspect, rotation);
  // Whatever shows there at all is fitted on the image itself, which decides.
  return reduced && acceptedSupport(small, reduced) > 0 ? refineFromReduced(image, reduced, factor) : null;
}

/** Fits every proposal the map's lines may support, strongest first, and keeps those they do. */
function fitProposals(image: GrayImage, spectra: Spectra, proposals: Proposal[], { minSize, maxSize, firstDecisive, minFactor, minSupport }: Round): RefinedGrid[] {
  const attempted: Proposal[] = [];
  const fits: RefinedGrid[] = [];
  const weak: RefinedGrid[] = [];
  let queue = [...proposals];

  while (queue.length > 0) {
    const proposal = queue.shift()!;
    const { gridType, size, harmonicsLeft } = proposal;
    if (attempted.some((earlier) => isSameAttempt(earlier, proposal)) || size < minSize || size > maxSize) continue;
    attempted.push(proposal);

    const fitted = fitProposal(image, spectra, proposal, minFactor);
    if (!fitted || !isStretchableAspect(fitted.aspect) || Math.abs(fitted.rotation) > MAX_ROTATION) continue;
    const refined: RefinedGrid = { ...fitted, support: acceptedSupport(image, fitted) };
    if (refined.support < minSupport) {
      if (refined.support > 0) weak.push(refined);
      continue;
    }
    fits.push(refined);
    if (harmonicsLeft > 0) {
      queue.push(...HARMONIC_MULTIPLES.map((multiple): Proposal => ({ gridType, size: refined.cellSize * multiple, aspect: refined.aspect, rotation: refined.rotation, harmonicsLeft: harmonicsLeft - 1, fromFit: true })));
    }
    if (refined.support < DECISIVE_SUPPORT) continue;
    if (firstDecisive) break;
    // No other grid type can explain a map this well; only this type's sizes are still worth fitting.
    queue = queue.filter((proposal) => proposal.gridType === gridType);
  }
  // Too little of a grid to stand on its own is still the map's grid at another size, where a multiple of it stands.
  return [...fits, ...weak.filter((fit) => fits.some((accepted) => areMultiples(accepted, fit)))];
}

/** Sizes of one grid: the same type and shape, one an integer multiple of the other (up to this many times). */
const MAX_MULTIPLE = 12;
const MULTIPLE_TOLERANCE = 0.02;

function areMultiples(a: RefinedGrid, b: RefinedGrid): boolean {
  if (a.gridType !== b.gridType || !sameAspect(a.aspect, b.aspect) || Math.abs(a.rotation - b.rotation) >= SAME_ROTATION) return false;
  const ratio = Math.max(a.cellSize, b.cellSize) / Math.min(a.cellSize, b.cellSize);
  const multiple = Math.round(ratio);
  return multiple <= MAX_MULTIPLE && Math.abs(ratio - multiple) < MULTIPLE_TOLERANCE * multiple;
}

/**
 * The grid type and shape of the strongest fit win (a regular grid, tried first, on a tie), and of
 * its sizes the densest that is the map's own grid: a coarser one has lines of the map between its
 * own, a finer one has lines of its own between the map's.
 */
function chooseFit(image: GrayImage, fits: RefinedGrid[]): RefinedGrid {
  const best = fits.reduce((a, b) => (a.support >= b.support ? a : b));
  const rivals = fits.filter((fit) => fit.gridType === best.gridType && sameAspect(fit.aspect, best.aspect) && Math.abs(fit.rotation - best.rotation) < SAME_ROTATION);
  return best.gridType === 'square' ? densestSquareGrid(image, best, rivals) : densestSupported(image, best.gridType, rivals);
}

/**
 * Sizes re-scored against each other with one common edge length, which makes their supports
 * comparable: the densest of the grids the map still supports. A grid of half the size has a line on
 * only every other edge.
 */
function densestSupported(image: GrayImage, gridType: GridType, rivals: RefinedGrid[]): RefinedGrid {
  const edgeLength = Math.min(...rivals.map((fit) => fit.cellSize));
  const compared = rivals.map((fit) => ({ fit, support: latticeSupport(image, gridType, fit, edgeLength) }));
  const bestSupport = Math.max(...compared.map((c) => c.support));
  const contenders = compared.filter((c) => c.support >= DENSER_GRID_PREFERENCE * bestSupport);
  return contenders.reduce((densest, c) => (c.fit.cellSize < densest.fit.cellSize ? c : densest)).fit;
}

/**
 * Of the sizes that are multiples of each other, the densest that is no finer copy of the map's
 * grid (`isFinerCopy`). Counting edges cannot choose here: a grid drawn on a dungeon's floors alone
 * has most edges of any size on blank paper.
 */
function densestSquareGrid(image: GrayImage, best: RefinedGrid, rivals: RefinedGrid[]): RefinedGrid {
  const sizes = rivals.filter((fit) => fit === best || areMultiples(best, fit)).sort((a, b) => a.cellSize - b.cellSize);
  return sizes.find((fit) => isFinerCopy(image, fit) === false) ?? best;
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
    ? HINT_SIZE_STEPS.map((step) => ({ gridType: hint.gridType, size: hint.cellSize * (1 + step), aspect: hint.aspect, rotation: hint.rotation, harmonicsLeft: 0 }))
    : [];

  // A hint's sizes all lie within a few percent of each other: the first that settles the grid is it.
  const round: Round = { minSize, maxSize, firstDecisive: hint !== undefined, minFactor: 1, minSupport: hint ? MIN_HINTED_SUPPORT : MIN_SUPPORT };
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
    const hint: GridHint = {
      gridType: rough.gridType,
      cellSize: rough.cellSize / (mapPerPixel * stretch.x),
      aspect: stretch.x / stretch.y,
      rotation: ((stretch.rotation ?? 0) * Math.PI) / 180,
    };
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

/**
 * A grid found in the luminance `image` of a map image of `size` pixels, as the world sees it: the
 * world of the map drawn turned level and stretched as the result's `mapStretch` says.
 */
function gridInWorld(detected: RefinedGrid, image: GrayImage, size: ImageSize): AlignmentResult {
  const mapPerPixel = size.width / image.width;
  const stretch = stretchForAspect(detected.aspect, detected.rotation);
  // The world begins at the corner of the box that holds the image once it is turned level.
  const { corner } = turnedBox(image.width, image.height, stretch);
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  // Detected offsets index pixels; a pixel's centre is half a pixel further in continuous image space.
  return {
    gridType: detected.gridType,
    cellSize: round2(detected.cellSize * mapPerPixel * stretch.x),
    offsetX: round2((detected.offsetX + 0.5 - corner.x) * mapPerPixel * stretch.x),
    offsetY: round2((detected.offsetY * detected.aspect + 0.5 - corner.y) * mapPerPixel * stretch.y),
    confidence: round2(detected.support),
    ...(sameStretch(stretch, NO_STRETCH) ? {} : { mapStretch: stretch }),
  };
}
