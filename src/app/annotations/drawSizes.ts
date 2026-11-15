/**
 * The Draw tool's named sizes. Each is a share of the grid cell, so the same name reads alike on
 * every map; what is drawn stores the pixels it came to.
 */

import { DEFAULT_CELL, DRAW_SIZES, type DrawSize } from './annotationTypes';

/** What a size is the size of. */
export type DrawSizeKind = 'stroke' | 'text' | 'stamp' | 'eraser';

type Shares = Readonly<Record<DrawSize, number>>;

/** Shares of a cell: a line's width, a text's height, a stamp's side and the eraser's radius. */
const SHARES: Readonly<Record<DrawSizeKind, Shares>> = {
  stroke: { s: 1 / 24, m: 1 / 12, l: 1 / 6, xl: 1 / 3 },
  text: { s: 0.3, m: 0.45, l: 0.7, xl: 1.1 },
  stamp: { s: 0.5, m: 1, l: 2, xl: 3 },
  eraser: { s: 1 / 8, m: 1 / 4, l: 1 / 2, xl: 1 },
};

/** The side of a cell sizes are shares of: the grid's, or `DEFAULT_CELL` on a map without one. */
export function drawCell(grid: { enabled: boolean; size: number } | null | undefined): number {
  return grid?.enabled && Number.isFinite(grid.size) && grid.size > 0 ? grid.size : DEFAULT_CELL;
}

const sized = (kind: DrawSizeKind, size: DrawSize, cell: number): number => SHARES[kind][size] * cell;

/** A line's width, world pixels. */
export function strokeWidth(size: DrawSize, cell: number): number {
  return sized('stroke', size, cell);
}

/** A text's font size, world pixels. */
export function textHeight(size: DrawSize, cell: number): number {
  return sized('text', size, cell);
}

/** A stamp's side, world pixels: M is one cell. */
export function stampSize(size: DrawSize, cell: number): number {
  return sized('stamp', size, cell);
}

/** The eraser's radius, world pixels. */
export function eraserRadius(size: DrawSize, cell: number): number {
  return sized('eraser', size, cell);
}

/**
 * The name nearest to a size of `pixels`, for showing what a selection has: nearest by ratio, since
 * the sizes step by factors. S for a size that is none.
 */
export function sizeOf(pixels: number, cell: number, kind: DrawSizeKind): DrawSize {
  if (!(pixels > 0) || !(cell > 0)) return 's';
  let nearest: DrawSize = 's';
  let least = Infinity;
  for (const size of DRAW_SIZES) {
    const distance = Math.abs(Math.log(pixels / sized(kind, size, cell)));
    if (distance < least) {
      least = distance;
      nearest = size;
    }
  }
  return nearest;
}

/** The size one step up (`+1`) or down (`-1`) from `size`; the last one stays. */
export function steppedSize(size: DrawSize, step: 1 | -1): DrawSize {
  const index = DRAW_SIZES.indexOf(size) + step;
  return DRAW_SIZES[Math.min(DRAW_SIZES.length - 1, Math.max(0, index))] ?? size;
}
