/**
 * What a token's move costs, in cells: the path's length (`pathLengthInCells`) plus, where the
 * rules price difficult terrain (`DifficultTerrainRule`), every step into a cell of difficult
 * terrain once more. Only the token drag ruler measures movement; the plain ruler measures distance.
 *
 * A segment between two points is walked cell by cell as a token steps across the grid: on a square
 * grid the line's cells with one step per cell of its longer side (a diagonal step where both
 * coordinates change, so a segment has as many diagonal steps as `pathLengthInCells` counts), on a
 * hex grid the hexes of the line. A step is into difficult terrain where any cell of the footprint
 * it lands in is (the footprint on a hex grid is its cell alone), and it then costs what it costs
 * once more: a diagonal of the alternating rule 1 or 2 as its turn falls, every other step the
 * segment's length shared out over its steps.
 */

import type { DiagonalRule, DifficultTerrainRule } from '../types/collectionSettingsTypes';
import { pathLengthInCells, type GridGeometry } from './gridDistance';
import { axialDistance, axialRound, axialToPixel, createHexLayout, isHexGridType, pixelToAxial, type HexLayout, type Point } from './hexGeometry';

/** Whether a cell, named by its centre in world pixels, is difficult terrain. */
export type DifficultCells = (cellCentre: Point) => boolean;

/** What the cost of a move goes by: the rules' diagonal and difficult terrain rules, and where difficult terrain lies. */
export interface MovementRules {
  readonly diagonalRule: DiagonalRule;
  readonly difficultTerrain?: DifficultTerrainRule | undefined;
  /** Null where the map has no difficult terrain. */
  readonly difficult: DifficultCells | null;
}

/** Nudges a hex line off the edges between hexes, so its rounding never wavers (Red Blob Games). */
const HEX_NUDGE = 1e-6;

/**
 * The cost in cells of moving through `points` (cell centres the footprint starts from, as the drag
 * ruler measures), for a footprint `footprint` cells across.
 */
export function movementCostInCells(grid: GridGeometry, points: readonly Point[], rules: MovementRules, footprint = 1): number {
  const length = pathLengthInCells(grid, points, rules.diagonalRule);
  if (rules.difficultTerrain !== 'double' || !rules.difficult || points.length < 2 || !(grid.size > 0)) return length;
  return length + (isHexGridType(grid.type)
    ? hexExtra(createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0), points, rules.difficult)
    : squareExtra(grid, points, rules.diagonalRule, rules.difficult, Math.max(1, Math.round(footprint))));
}

function hexExtra(layout: HexLayout, points: readonly Point[], difficult: DifficultCells): number {
  let extra = 0;
  for (let i = 1; i < points.length; i++) {
    const from = pixelToAxial(layout, points[i - 1]!);
    const to = pixelToAxial(layout, points[i]!);
    const steps = axialDistance(from, to);
    for (let step = 1; step <= steps; step++) {
      const share = step / steps;
      const hex = axialRound({ q: from.q + (to.q - from.q) * share + HEX_NUDGE, r: from.r + (to.r - from.r) * share + HEX_NUDGE });
      if (difficult(axialToPixel(layout, hex))) extra += 1;
    }
  }
  return extra;
}

function squareExtra(grid: GridGeometry, points: readonly Point[], diagonalRule: DiagonalRule, difficult: DifficultCells, footprint: number): number {
  const { size } = grid;
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  // The footprint's cells around the cell it starts from: an even footprint starts up and left of its centre.
  const low = -(Math.ceil(footprint / 2) - 1);
  const high = Math.floor(footprint / 2);
  const entersDifficult = (col: number, row: number): boolean => {
    for (let dy = low; dy <= high; dy++) {
      for (let dx = low; dx <= high; dx++) {
        if (difficult({ x: offsetX + (col + dx + 0.5) * size, y: offsetY + (row + dy + 0.5) * size })) return true;
      }
    }
    return false;
  };
  let extra = 0;
  // The alternating rule counts diagonals over the whole path.
  let diagonals = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const col0 = Math.floor((a.x - offsetX) / size);
    const row0 = Math.floor((a.y - offsetY) / size);
    const cols = Math.floor((b.x - offsetX) / size) - col0;
    const rows = Math.floor((b.y - offsetY) / size) - row0;
    const steps = Math.max(Math.abs(cols), Math.abs(rows));
    if (steps === 0) continue;
    const share = pathLengthInCells(grid, [a, b], diagonalRule) / steps;
    let col = col0;
    let row = row0;
    for (let step = 1; step <= steps; step++) {
      const nextCol = col0 + Math.round((cols * step) / steps);
      const nextRow = row0 + Math.round((rows * step) / steps);
      const diagonal = nextCol !== col && nextRow !== row;
      let cost = share;
      if (diagonalRule === 'alternating') cost = diagonal && diagonals % 2 === 1 ? 2 : 1;
      if (diagonal) diagonals++;
      col = nextCol;
      row = nextRow;
      if (entersDifficult(col, row)) extra += cost;
    }
  }
  return extra;
}
