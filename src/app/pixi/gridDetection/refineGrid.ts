/**
 * Precise cell size and offset for a grid hypothesis: the lattice search gets
 * within a few pixels, the lattice fit makes it sub-pixel and reports how much of
 * the grid the map's lines support.
 *
 * A map's cells may not be regular: hexes printed a few percent too tall, squares
 * that are rectangles. The fit then also finds the aspect of the cells, and the
 * grid is given on the squared-up image (`LatticeCandidate`). A regular grid is
 * kept wherever the map's lines do not clearly speak for another aspect.
 */

import type { GridType } from '../../grid/GridSystem';
import { normaliseGridOffset } from '../../grid/gridPlacement';
import type { GrayImage } from './grayImage';
import { aspectOf } from './edgeProfile';
import type { LatticeCandidate } from './edgeProfile';
import { fitLattice } from './latticeFit';
import type { LatticeFit } from './latticeFit';
import { searchLattice } from './latticeSearch';

export interface RefinedGrid {
  gridType: GridType;
  /** Size and offsets on the squared-up image: the image with its rows `aspect` times closer together. */
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** How many times further apart the image's rows lie than a regular grid's; 1 for a regular grid. */
  aspect: number;
  /** Share of the grid's edges that sit on a line of the map, corrected for chance (0–1). */
  support: number;
}

/** An aspect that moves no line of the map by this many pixels is the regular grid. */
const REGULAR_DRIFT = 0.5;
/** A fitted aspect replaces a regular grid only where the map's lines support it this much better. */
const ASPECT_GAIN = 1.1;
const ASPECT_MARGIN = 0.02;
/** With this much of the grid on the map's lines, no other aspect can fit better: none is tried. */
const SETTLED_SUPPORT = 0.9;

/** The fit takes up lines a few pixels from where it expects them: on an image this low, cells a few percent off regular are that near at its rim. */
const REACHABLE_HEIGHT = 400;

function aspectsWithinReach(image: GrayImage): boolean {
  return image.height <= REACHABLE_HEIGHT;
}

function isRegular(image: GrayImage, aspect: number): boolean {
  return (Math.abs(aspect - 1) * image.height) / 2 < REGULAR_DRIFT;
}

/**
 * A regular fit, or the fit with the aspect left free where the lines support that clearly better:
 * most maps are regular.
 */
function withFittedAspect(image: GrayImage, gridType: GridType, regular: LatticeFit): LatticeFit {
  if (regular.support >= SETTLED_SUPPORT) return regular;
  // Where no line lies on the regular grid, an aspect within the fit's reach of it finds none either,
  // unless the image is so small that every plausible aspect is within reach.
  if (regular.support === 0 && !aspectsWithinReach(image)) return regular;
  const free = fittedAspect(image, gridType, regular.candidate);
  return free.support > regular.support * ASPECT_GAIN + ASPECT_MARGIN ? free : regular;
}

/** The fit from `start` with the aspect left free; the regular grid where the aspect it finds is as good as 1. */
function fittedAspect(image: GrayImage, gridType: GridType, start: LatticeCandidate): LatticeFit {
  const free = fitLattice(image, gridType, start, true);
  return isRegular(image, aspectOf(free.candidate)) ? fitLattice(image, gridType, onRegularImage(free.candidate)) : free;
}

/** The same grid read on the image itself; right only where the aspect is as good as 1. */
function onRegularImage(candidate: LatticeCandidate): LatticeCandidate {
  return { ...candidate, offsetY: candidate.offsetY * aspectOf(candidate), aspect: 1 };
}

/**
 * The fit from a candidate that is good to a few pixels. A regular candidate stays regular unless the
 * lines speak for another aspect; another aspect is only ever rough (a percent off moves the lines at
 * the map's rim by pixels), so its fit leaves the aspect free from the start.
 */
function fitFrom(image: GrayImage, gridType: GridType, start: LatticeCandidate): LatticeFit {
  return aspectOf(start) === 1 ? withFittedAspect(image, gridType, fitLattice(image, gridType, start)) : fittedAspect(image, gridType, start);
}

function refined(gridType: GridType, fit: LatticeFit): RefinedGrid {
  const { cellSize, offsetX, offsetY } = fit.candidate;
  return { gridType, cellSize, ...normaliseGridOffset(gridType, cellSize, offsetX, offsetY), aspect: aspectOf(fit.candidate), support: fit.support };
}

/** `roughAspect` is the aspect the hypothesis gives the map's cells; 1 for a regular grid. */
export function refineGrid(image: GrayImage, gridType: GridType, roughCellSize: number, roughAspect = 1): RefinedGrid | null {
  const found = searchLattice(image, gridType, roughCellSize, roughAspect);
  if (!found) return null;
  return refined(gridType, fitFrom(image, gridType, found));
}

/**
 * A grid found on `image` reduced `factor` times (`downsampleGray`), fitted on the image itself.
 * A reduced pixel is the mean of `factor` × `factor` pixels, so its index lies half a reduced pixel less half a pixel further in.
 */
export function refineFromReduced(image: GrayImage, grid: RefinedGrid, factor: number): RefinedGrid {
  const shift = (factor - 1) / 2;
  const start: LatticeCandidate = {
    cellSize: grid.cellSize * factor,
    offsetX: grid.offsetX * factor + shift,
    offsetY: grid.offsetY * factor + shift / grid.aspect,
    aspect: grid.aspect,
  };
  return refined(grid.gridType, fitFrom(image, grid.gridType, start));
}
