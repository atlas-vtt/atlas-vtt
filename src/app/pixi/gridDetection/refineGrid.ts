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
import { aspectOf, rotationOf } from './edgeProfile';
import type { LatticeCandidate } from './edgeProfile';
import { fitLattice, FREE_SHAPE } from './latticeFit';
import type { LatticeFit } from './latticeFit';
import { searchLattice } from './latticeSearch';

export interface RefinedGrid {
  gridType: GridType;
  /** Size and offsets on the squared-up image: the image turned level by `rotation`, then with its rows `aspect` times closer together. */
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** How many times further apart the image's rows lie than a regular grid's; 1 for a regular grid. */
  aspect: number;
  /** The angle in radians the image is turned by against a level grid; 0 for a level map. */
  rotation: number;
  /** Share of the grid's edges that sit on a line of the map, corrected for chance (0–1). */
  support: number;
}

/** A shape that moves no line of the map by this many pixels is the plain one: regular cells on a level map. */
const PLAIN_DRIFT = 0.5;
/** A fitted shape replaces the plain one only where the map's lines support it this much better: most maps are plain. */
const SHAPE_GAIN = 1.1;
const SHAPE_MARGIN = 0.02;
/** With this much of the grid on the map's lines, no other shape can fit better: none is tried. */
const SETTLED_SUPPORT = 0.9;

/** The fit takes up lines a few pixels from where it expects them: on an image this low, cells a few percent off regular are that near at its rim. */
const REACHABLE_HEIGHT = 400;

function shapesWithinReach(image: GrayImage): boolean {
  return image.height <= REACHABLE_HEIGHT;
}

function isRegular(image: GrayImage, aspect: number): boolean {
  return (Math.abs(aspect - 1) * image.height) / 2 < PLAIN_DRIFT;
}

function isLevel(image: GrayImage, rotation: number): boolean {
  return (Math.abs(rotation) * Math.hypot(image.width, image.height)) / 2 < PLAIN_DRIFT;
}

function isPlain(candidate: LatticeCandidate): boolean {
  return aspectOf(candidate) === 1 && rotationOf(candidate) === 0;
}

/**
 * A plain fit, or the fit with the shape left free where the lines support that clearly better:
 * most maps have regular cells and lie level.
 */
function withFittedShape(image: GrayImage, gridType: GridType, plain: LatticeFit): LatticeFit {
  if (plain.support >= SETTLED_SUPPORT) return plain;
  // Where no line lies on the plain grid, a shape within the fit's reach of it finds none either,
  // unless the image is so small that every plausible shape is within reach.
  if (plain.support === 0 && !shapesWithinReach(image)) return plain;
  const free = fittedShape(image, gridType, plain.candidate);
  return free.support > plain.support * SHAPE_GAIN + SHAPE_MARGIN ? free : plain;
}

/**
 * The fit from `start` with aspect and rotation left free. What it finds as good as plain (an aspect
 * as good as 1, an angle as good as none) is plain, and the rest is fitted again from where it ended.
 */
function fittedShape(image: GrayImage, gridType: GridType, start: LatticeCandidate): LatticeFit {
  const free = reseated(image, gridType, start, fitLattice(image, gridType, start, FREE_SHAPE));
  const regular = isRegular(image, aspectOf(free.candidate));
  const level = isLevel(image, rotationOf(free.candidate));
  if (!regular && !level) return free;
  const settled: LatticeCandidate = { ...(regular ? onRegularImage(free.candidate) : free.candidate), ...(level ? { rotation: 0 } : {}) };
  return fitLattice(image, gridType, settled, { aspect: !regular, rotation: !level });
}

/** A fit whose shape moved the map's lines by this many pixels or more since its start may have left the place it started from behind. */
const RESEAT_DRIFT = 2;

/**
 * A fit that found another shape keeps the place it was given for the shape it started with, and
 * may end with the right cells beside the map's lines. The search places the grid again on the
 * shape the fit ended with and the fit runs once more from there; the better supported one stays.
 */
function reseated(image: GrayImage, gridType: GridType, start: LatticeCandidate, fit: LatticeFit): LatticeFit {
  if (fit.support >= SETTLED_SUPPORT) return fit;
  const aspect = aspectOf(fit.candidate);
  const rotation = rotationOf(fit.candidate);
  const drift = (Math.abs(aspect - aspectOf(start)) * image.height + Math.abs(rotation - rotationOf(start)) * Math.hypot(image.width, image.height)) / 2;
  if (drift < RESEAT_DRIFT) return fit;
  const placed = searchLattice(image, gridType, fit.candidate.cellSize, aspect, rotation);
  if (!placed) return fit;
  const again = fitLattice(image, gridType, placed, FREE_SHAPE);
  return again.support > fit.support ? again : fit;
}

/** The same grid read with regular cells; right only where the aspect is as good as 1. */
function onRegularImage(candidate: LatticeCandidate): LatticeCandidate {
  return { ...candidate, offsetY: candidate.offsetY * aspectOf(candidate), aspect: 1 };
}

/**
 * The fit from a candidate that is good to a few pixels. A plain candidate stays plain unless the
 * lines speak for another shape; another aspect is only ever rough (a percent off moves the lines at
 * the map's rim by pixels), so its fit leaves the shape free from the start.
 */
function fitFrom(image: GrayImage, gridType: GridType, start: LatticeCandidate): LatticeFit {
  return isPlain(start) ? withFittedShape(image, gridType, fitLattice(image, gridType, start)) : fittedShape(image, gridType, start);
}

function refined(gridType: GridType, fit: LatticeFit): RefinedGrid {
  const { cellSize, offsetX, offsetY } = fit.candidate;
  return {
    gridType,
    cellSize,
    ...normaliseGridOffset(gridType, cellSize, offsetX, offsetY),
    aspect: aspectOf(fit.candidate),
    rotation: rotationOf(fit.candidate),
    support: fit.support,
  };
}

/** `roughAspect` and `roughRotation` are the shape the hypothesis gives the map; 1 and 0 for a regular grid on a level map. */
export function refineGrid(image: GrayImage, gridType: GridType, roughCellSize: number, roughAspect = 1, roughRotation = 0): RefinedGrid | null {
  const found = searchLattice(image, gridType, roughCellSize, roughAspect, roughRotation);
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
    rotation: grid.rotation,
  };
  return refined(grid.gridType, fitFrom(image, grid.gridType, start));
}
