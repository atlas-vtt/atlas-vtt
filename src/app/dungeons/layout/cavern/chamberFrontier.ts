/**
 * The cells a growing chamber may take next, kept in reading order (by row, then by column): the
 * pick walks them in that order, and a large chamber takes hundreds of cells, so the frontier is
 * kept sorted as cells come rather than sorted anew at every step.
 */

import { cellKey } from '../../geometry';
import type { CellPoint } from '../../model';
import { NEAR8 } from './caveGrid';

/** A cell the chamber may take, with its weight. */
export type Option = [CellPoint, number];

/** How many of the cell's eight neighbours `mask` holds. */
export function neighboursIn(mask: ReadonlySet<string>, c: CellPoint): number {
  let count = 0;
  for (const [dx, dy] of NEAR8) if (mask.has(cellKey(c.x + dx, c.y + dy))) count++;
  return count;
}

/** Where a cell goes among options kept in reading order. */
export function readingIndex(options: readonly Option[], c: CellPoint): number {
  let lo = 0;
  let hi = options.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = options[mid]![0];
    if (at.y < c.y || (at.y === c.y && at.x < c.x)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
