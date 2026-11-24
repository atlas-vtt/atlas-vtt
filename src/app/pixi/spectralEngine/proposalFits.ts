/**
 * Fitting the proposals of one round of detection to the map's lines, strongest first, and keeping
 * those the lines support. The search is a generator that hands out every fit it needs
 * (`FitStep`) and is handed the fit back: `fitRequested` is pure, so where it runs (here, or on
 * another thread ahead of time, `fitDrivers`) changes nothing of the answer.
 */

import type { GrayImage } from './grayImage';
import { reducedImage } from './gridProposals';
import type { Proposal } from './gridProposals';
import { latticeSupport } from './latticeFit';
import { isFinerCopy, sharesLinesOnly } from './subGrid';
import { refineFromReduced, refineGrid } from './refineGrid';
import type { RefinedGrid } from './refineGrid';
import { MAX_ROTATION_DEGREES, MAX_STRETCH_FACTOR } from '../../grid/mapStretch';

/** Support at which a fit settles the grid type: most of the map's lines agree with it. */
export const DECISIVE_SUPPORT = 0.5;
/** A spectral peak may be a harmonic of the grid, so the half and the double of a supported size are fitted too. */
const HARMONIC_MULTIPLES = [2, 0.5];
/** A square fit with lines of its own between the map's is a harmonic of the map's grid, which may be three or five times as large as well. */
const FINER_COPY_MULTIPLES = [3, 5];
/** Sizes closer than this fraction are the same proposal. */
const SAME_SIZE_TOLERANCE = 0.03;
/** Aspects closer than this fraction are the same grid at other sizes. */
const SAME_ASPECT_TOLERANCE = 0.005;

export function sameSize(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_SIZE_TOLERANCE * b;
}

export function sameAspect(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_ASPECT_TOLERANCE * b;
}

/** A fit that turns the map further than a scan lies askew found no grid. */
const MAX_ROTATION = (MAX_ROTATION_DEGREES * Math.PI) / 180;
/** Angles closer than this are the same grid at other sizes. */
export const SAME_ROTATION = 0.002;

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

export interface Round {
  /** Sizes outside this range are not fitted. */
  minSize: number;
  maxSize: number;
  /** Cells smaller than this need a fit that settles the grid. */
  sureSize: number;
  /** Ends at the first fit that settles the grid, where the sizes are known not to be harmonics of it. */
  firstDecisive: boolean;
  /** The image is reduced at least this many times before it is searched. */
  minFactor: number;
  /** Support below which a fit found no grid. */
  minSupport: number;
  /** A square grid's rows may lie this many times further apart, or closer together, than a regular grid's. */
  maxSquareAspect: number;
  /** A square fit that only shares lines with the map's grid (`sharesLinesOnly`) is no fit: for a hint, whose size says which grid is meant. */
  ownLinesOnly: boolean;
}

/**
 * The lines of a square grid run on across the map, so a real one is also found by edges of this
 * length (a quarter of the map's shorter side where that is less), which see fainter lines than
 * edges of one cell. What only looks like a grid cell by cell (floor boards, tesserae, shelves) is not
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
function fitProposal(image: GrayImage, { gridType, size, aspect, rotation }: Proposal, minFactor: number): RefinedGrid | null {
  const factor = Math.max(minFactor, Math.floor(size / SEARCH_CELL_SIZE));
  if (factor <= 1) return refineGrid(image, gridType, size, aspect, rotation);
  const small = reducedImage(image, factor);
  const reduced = refineGrid(small, gridType, size / factor, aspect, rotation);
  // Whatever shows there at all is fitted on the image itself, which decides.
  return reduced && acceptedSupport(small, reduced) > 0 ? refineFromReduced(image, reduced, factor) : null;
}

/** Whether cells of `aspect` are further off regular than `max` times, either way. */
export function isOffRegularBeyond(aspect: number, max: number): boolean {
  return aspect > max || aspect < 1 / max;
}

/** One proposal to fit, in a round that keeps square cells up to `maxSquareAspect` off regular. */
export interface FitRequest {
  proposal: Proposal;
  minFactor: number;
  maxSquareAspect: number;
}

/**
 * The fit of a proposal with the support it is accepted on; null where it found no grid, or one
 * of a shape no round keeps. The same on any thread for the same image.
 */
export function fitRequested(image: GrayImage, { proposal, minFactor, maxSquareAspect }: FitRequest): RefinedGrid | null {
  const fitted = fitProposal(image, proposal, minFactor);
  const maxAspect = proposal.gridType === 'square' ? maxSquareAspect : MAX_STRETCH_FACTOR;
  if (!fitted || !(fitted.cellSize > 0) || isOffRegularBeyond(fitted.aspect, maxAspect) || Math.abs(fitted.rotation) > MAX_ROTATION) return null;
  return { ...fitted, support: acceptedSupport(image, fitted) };
}

/** A fit the detection needs now, and the fits it would ask for next as things stand, in that order. */
export interface FitStep {
  request: FitRequest;
  ahead: FitRequest[];
}

/** A detection that hands out the fits it needs (`fitRequested` answers each) and ends with a `T`. */
export type FitSteps<T> = Generator<FitStep, T, RefinedGrid | null>;

/**
 * The half and the double of a supported fit, as proposals of its exact shape; of a spectral peak
 * that turned out a finer copy of the map's grid, its larger multiples too. Only of a peak: on a map
 * whose grid shows on its floors alone, multiples of the grid look like finer copies as well, and
 * theirs would be no grid of the map's.
 */
function harmonicProposals(image: GrayImage, fit: RefinedGrid, { harmonicsLeft, fromFit }: Proposal): Proposal[] {
  const isPeak = !fromFit && fit.gridType === 'square';
  const multiples = isPeak && isFinerCopy(image, fit) === true ? [...HARMONIC_MULTIPLES, ...FINER_COPY_MULTIPLES] : HARMONIC_MULTIPLES;
  return multiples.map((multiple): Proposal => ({ gridType: fit.gridType, size: fit.cellSize * multiple, aspect: fit.aspect, rotation: fit.rotation, harmonicsLeft: harmonicsLeft - 1, fromFit: true }));
}

/** Whether a square fit short of settling the grid only shares lines with the map's own grid (`sharesLinesOnly`). */
export function sharesMapLinesOnly(image: GrayImage, fit: RefinedGrid): boolean {
  return fit.gridType === 'square' && fit.support < DECISIVE_SUPPORT && sharesLinesOnly(image, fit);
}

/** Hears what a detection under way does: every grid it tries on the map, and every one the map's lines support. */
export interface DetectionWatch {
  /** A grid of this type, about this size and of this shape is fitted next. */
  tried?(proposal: Proposal): void;
  fitted?(fit: RefinedGrid): void;
}

/** Sizes of one grid: the same type and shape, one an integer multiple of the other (up to this many times). */
export const MAX_MULTIPLE = 12;
const MULTIPLE_TOLERANCE = 0.02;

export function areMultiples(a: RefinedGrid, b: RefinedGrid): boolean {
  if (a.gridType !== b.gridType || !sameAspect(a.aspect, b.aspect) || Math.abs(a.rotation - b.rotation) >= SAME_ROTATION) return false;
  const ratio = Math.max(a.cellSize, b.cellSize) / Math.min(a.cellSize, b.cellSize);
  const multiple = Math.round(ratio);
  return multiple <= MAX_MULTIPLE && Math.abs(ratio - multiple) < MULTIPLE_TOLERANCE * multiple;
}

/** Fits every proposal the map's lines may support, strongest first, and keeps those they do. */
export function* fitProposals(image: GrayImage, proposals: Proposal[], { minSize, maxSize, sureSize, firstDecisive, minFactor, minSupport, maxSquareAspect, ownLinesOnly }: Round, watch?: DetectionWatch): FitSteps<RefinedGrid[]> {
  const attempted: Proposal[] = [];
  const fits: RefinedGrid[] = [];
  const weak: RefinedGrid[] = [];
  let queue = [...proposals];
  const isWanted = (proposal: Proposal): boolean => !(attempted.some((earlier) => isSameAttempt(earlier, proposal)) || proposal.size < minSize || proposal.size > maxSize);
  const requestOf = (proposal: Proposal): FitRequest => ({ proposal, minFactor, maxSquareAspect });

  while (queue.length > 0) {
    const proposal = queue.shift()!;
    const { gridType, harmonicsLeft } = proposal;
    if (!isWanted(proposal)) continue;
    attempted.push(proposal);
    watch?.tried?.(proposal);

    const refined = yield { request: requestOf(proposal), ahead: queue.filter(isWanted).map(requestOf) };
    if (!refined) continue;
    // Hexes further off regular than any print are a tessera set's, whose lines agree with them all over the map.
    if (isOffRegularBeyond(refined.aspect, maxSquareAspect) && refined.support < DECISIVE_SUPPORT) continue;
    if (refined.cellSize < sureSize && refined.support < DECISIVE_SUPPORT) continue;
    if (refined.support < minSupport) {
      if (refined.support > 0) weak.push(refined);
      continue;
    }
    if (ownLinesOnly && sharesMapLinesOnly(image, refined)) continue;
    fits.push(refined);
    watch?.fitted?.(refined);
    if (harmonicsLeft > 0) queue.push(...harmonicProposals(image, refined, proposal));
    if (refined.support < DECISIVE_SUPPORT) continue;
    if (firstDecisive) break;
    // No other grid type can explain a map this well; only this type's sizes are still worth fitting.
    queue = queue.filter((queued) => queued.gridType === gridType);
  }
  // Too little of a grid to stand on its own is still the map's grid at another size, where a multiple of it stands.
  return [...fits, ...weak.filter((fit) => fits.some((accepted) => areMultiples(accepted, fit)))];
}
