/**
 * The Spectral Engine, Atlas' grid detection from the map image: spectral analysis proposes grid
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
import { firstRoundProposals, secondRoundFactor, secondRoundProposals, spectraOf, spectrumFactor } from './gridProposals';
import type { Proposal } from './gridProposals';
import type { GridType } from '../../grid/GridSystem';
import { latticeSupport } from './latticeFit';
import { isFinerCopy } from './subGrid';
import type { RefinedGrid } from './refineGrid';
import type { DetectableMap } from '../mosaicCanvas/mosaicCanvasView';
import { MAX_STRETCH_FACTOR, NO_STRETCH, sameStretch, stretchForAspect, turnedBox } from '../../grid/mapStretch';
import { areMultiples, DECISIVE_SUPPORT, fitProposals, MAX_MULTIPLE, SAME_ROTATION, sameAspect, sameSize, sharesMapLinesOnly } from './proposalFits';
import type { DetectionWatch, FitSteps, Round } from './proposalFits';
import { runFits } from './fitDrivers';

export type { DetectableMap } from '../mosaicCanvas/mosaicCanvasView';
export { DECISIVE_SUPPORT } from './proposalFits';
export type { DetectionWatch } from './proposalFits';

/** Longest side of the analysed image; larger maps are scaled down before detection. */
export const MAX_ANALYSIS_SIDE = 4096;
/** Support below which the map is reported as having no grid. */
const MIN_SUPPORT = 0.05;
/** The smallest cells looked for, in pixels of the analysed image: in smaller ones the flanks a line is compared with (`lineProbe`) and the window it is looked for in (`MAX_REACH_IN_CELLS`) reach the next line. */
const MIN_CELL_SIZE = 8;
/**
 * Cells smaller than this are the map's grid only where its lines settle it (`DECISIVE_SUPPORT`): the
 * window a line is looked for in shrinks with the cell, so chance puts more of a small grid's edges
 * on lines of any map, and a seventh of a large grid's cell or the lettering of a small map fits a little.
 */
const SURE_CELL_SIZE = 12;
/**
 * A square fit with cells further off regular than this has taken every fourth line one way and
 * every fifth the other for a grid: columns and rows of a square grid fit each on their own. Hexes
 * are found by three directions at once, and tessera sets draw them up to a sixth off regular. A grid
 * the GM measured says its own shape.
 */
const MAX_DETECTED_SQUARE_ASPECT = 1.1;
/** Fits supported this nearly alike are a tie, which the more regular one wins. */
const SUPPORT_TIE = 0.02;
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

/**
 * A spectral peak is the grid's period or a fraction or multiple of it, and a hint says which: the
 * peak's shape at the sizes near the hint's.
 */
function atHintedSizes(proposals: Proposal[], minSize: number, maxSize: number): Proposal[] {
  const sizesOf = (size: number): number[] => {
    const sizes = [size / 3, size / 2];
    for (let multiple = 1; multiple <= MAX_MULTIPLE && size * multiple <= maxSize; multiple++) sizes.push(size * multiple);
    return sizes.filter((candidate) => candidate >= minSize && candidate <= maxSize);
  };
  return proposals.flatMap((proposal) => sizesOf(proposal.size).map((size): Proposal => ({ ...proposal, size, harmonicsLeft: 0 })));
}

/**
 * The grid type and shape of the strongest fit win (the most regular one on a tie), and of
 * its sizes the densest that is the map's own grid: a coarser one has lines of the map between its
 * own, a finer one has lines of its own between the map's.
 */
function chooseFit(image: GrayImage, fits: RefinedGrid[]): RefinedGrid {
  const strongest = Math.max(...fits.map((fit) => fit.support));
  const offRegular = (fit: RefinedGrid): number => Math.abs(Math.log(fit.aspect)) + Math.abs(fit.rotation);
  const best = fits.filter((fit) => fit.support >= strongest - SUPPORT_TIE).reduce((a, b) => (offRegular(a) <= offRegular(b) ? a : b));
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
export function detectGridInImage(image: GrayImage, hint?: GridHint, watch?: DetectionWatch): RefinedGrid | null {
  return runFits(image, detectionSteps(image, hint, watch));
}

/** `detectGridInImage` as the fits it needs (`FitSteps`). */
export function* detectionSteps(image: GrayImage, hint?: GridHint, watch?: DetectionWatch): FitSteps<RefinedGrid | null> {
  // A size that is no positive number hints at nothing.
  if (hint && !(hint.cellSize > 0 && Number.isFinite(hint.cellSize))) return null;
  const factor = spectrumFactor(image);
  const spectra = spectraOf(image);
  const minSize = hint ? hint.cellSize * (1 - HINT_SIZE_RANGE) : MIN_CELL_SIZE;
  const maxSize = hint ? hint.cellSize * (1 + HINT_SIZE_RANGE) : Math.min(image.width, image.height) / 3;
  const wanted = (proposals: Proposal[]): Proposal[] => (hint ? atHintedSizes(proposals.filter((p) => p.gridType === hint.gridType), minSize, maxSize) : proposals);
  const hinted: Proposal[] = hint
    ? HINT_SIZE_STEPS.map((step) => ({ gridType: hint.gridType, size: hint.cellSize * (1 + step), aspect: hint.aspect, rotation: hint.rotation, harmonicsLeft: 0 }))
    : [];

  // A hint's sizes all lie within a few percent of each other: the first that settles the grid is it.
  const round: Round = { minSize, maxSize, sureSize: hint ? 0 : SURE_CELL_SIZE, firstDecisive: hint !== undefined, minFactor: 1, minSupport: hint ? MIN_HINTED_SUPPORT : MIN_SUPPORT, maxSquareAspect: hint ? MAX_STRETCH_FACTOR : MAX_DETECTED_SQUARE_ASPECT, ownLinesOnly: hint !== undefined };
  const fits = yield* fitProposals(image, [...hinted, ...wanted(firstRoundProposals(spectra, factor))], round, watch);
  // A regular grid that most of the map's lines agree with is the map's grid: only otherwise is a second round worth its time.
  if (!fits.some((fit) => fit.support >= DECISIVE_SUPPORT)) {
    // A large map is searched reduced, which costs a fraction; what its lines support there is fitted on the map itself.
    fits.push(...(yield* fitProposals(image, wanted(secondRoundProposals(image, spectra, factor)), { ...round, minFactor: secondRoundFactor(image) }, watch)));
  }
  if (fits.length === 0) return null;
  const chosen = chooseFit(image, fits);
  // What is left of a square grid that shares lines with the map's own, where that one was never fitted, is no grid.
  return sharesMapLinesOnly(image, chosen) ? null : chosen;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** A map's luminance and the size of the image it was read from. */
export interface MapGray {
  image: GrayImage;
  size: ImageSize;
}

/**
 * A map's picture, for whoever reads its luminance: the detection's worker, so that reading up to
 * sixteen million pixels holds no frame of the window's. `bitmap` hands out a picture of its own
 * each time; whoever takes one closes it.
 */
export interface MapPicture {
  size: ImageSize;
  bitmap(): Promise<ImageBitmap | null>;
}

/** The picture of a map at up to `MAX_ANALYSIS_SIDE` a side; null for a map too small or without pixels. */
export function pictureOf(map: DetectableMap): MapPicture | null {
  const size = map.imageSize;
  if (!size || size.width < 64 || size.height < 64) return null;
  return { size, bitmap: () => map.overview(MAX_ANALYSIS_SIDE) };
}

/** The luminance of a map's picture of `size` pixels, which is closed; `canvas` is the worker's own where there is no document. */
export function grayOfBitmap(bitmap: ImageBitmap, size: ImageSize, canvas?: OffscreenCanvas): MapGray | null {
  try {
    const image = grayFromCanvasSource(bitmap, bitmap.width, bitmap.height, MAX_ANALYSIS_SIDE, canvas);
    return image ? { image, size } : null;
  } finally {
    bitmap.close();
  }
}

/** The map's luminance at up to `MAX_ANALYSIS_SIDE` a side, with the image's own size; null for a map too small or without pixels. */
export async function readMapGray(map: DetectableMap): Promise<MapGray | null> {
  const picture = pictureOf(map);
  const bitmap = await picture?.bitmap();
  return picture && bitmap ? grayOfBitmap(bitmap, picture.size) : null;
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
export function snapGridToMapGray(gray: MapGray, candidates: AlignmentResult[]): AlignmentResult | null {
  const snapped = snapGridInMapGray(gray, candidates);
  return snapped ? gridInWorld(snapped, gray.image, gray.size) : null;
}

/** `snapGridToMapGray` with the grid as the image has it, and every supported fit reported on the way. */
export function snapGridInMapGray(gray: MapGray, candidates: AlignmentResult[], watch?: DetectionWatch): RefinedGrid | null {
  return runFits(gray.image, snapSteps(gray, candidates, watch));
}

/** `snapGridInMapGray` as the fits it needs (`FitSteps`). */
export function* snapSteps({ image, size }: MapGray, candidates: AlignmentResult[], watch?: DetectionWatch): FitSteps<RefinedGrid | null> {
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
    if (asked.some((earlier) => earlier.gridType === hint.gridType && sameAspect(earlier.aspect, hint.aspect) && sameSize(earlier.cellSize, hint.cellSize))) continue;
    if (fits.some((fit) => fit.gridType !== hint.gridType && fit.support >= DECISIVE_SUPPORT)) break;
    asked.push(hint);
    const detected = yield* detectionSteps(image, hint, watch);
    if (detected) fits.push(detected);
  }
  return fits.length > 0 ? chooseFit(image, fits) : null;
}

/**
 * A grid found in the luminance `image` of a map image of `size` pixels, as the world sees it: the
 * world of the map drawn turned level and stretched as the result's `mapStretch` says.
 */
export function gridInWorld(detected: RefinedGrid, image: GrayImage, size: ImageSize): AlignmentResult {
  const stretch = stretchForAspect(detected.aspect, detected.rotation);
  const world = worldPlaceOf(detected, image, size);
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  const offset = world(detected.offsetX, detected.offsetY);
  return {
    gridType: detected.gridType,
    cellSize: round2(detected.cellSize * (size.width / image.width) * stretch.x),
    offsetX: round2(offset.x),
    offsetY: round2(offset.y),
    confidence: round2(detected.support),
    ...(sameStretch(stretch, NO_STRETCH) ? {} : { mapStretch: stretch }),
  };
}

/** Where a place of a detected grid's squared-up image lies in the world `gridInWorld` gives the grid in. */
export function worldPlaceOf(detected: RefinedGrid, image: GrayImage, size: ImageSize): (x: number, y: number) => { x: number; y: number } {
  const mapPerPixel = size.width / image.width;
  const stretch = stretchForAspect(detected.aspect, detected.rotation);
  // The world begins at the corner of the box that holds the image once it is turned level.
  const { corner } = turnedBox(image.width, image.height, stretch);
  // Detected places index pixels; a pixel's centre is half a pixel further in continuous image space.
  return (x, y) => ({
    x: (x + 0.5 - corner.x) * mapPerPixel * stretch.x,
    y: (y * detected.aspect + 0.5 - corner.y) * mapPerPixel * stretch.y,
  });
}
