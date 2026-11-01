/**
 * The cells a cave outline is drawn and checked against, read once into grids over its box, and
 * where a fault's cells lie: the eased corners are those near them.
 */

import type { CellPoint } from '../../model';
import type { CellGrid } from '../../water/wetGrid';
import type { Vec } from '../geometry';
import type { NarrowShare } from './outlineGuard';

type IsFloor = (x: number, y: number) => boolean;

/** The cells an outline is checked against, read once into grids over its box: floor (asked again outside the box), those kept, and the narrow ways' shares. */
export interface Cells {
  box: CellGrid;
  floor: IsFloor;
  kept?: IsFloor;
  narrow?: NarrowShare;
}

/** The narrow ways' shares read into a grid over the box; none outside it. */
function readNarrow(narrow: NarrowShare, box: CellGrid): NarrowShare {
  const grid = new Float32Array(box.w * box.h);
  for (let gy = 0; gy < box.h; gy++) for (let gx = 0; gx < box.w; gx++) grid[gy * box.w + gx] = narrow(box.x0 + gx, box.y0 + gy) ?? 0;
  return (x, y) => {
    const gx = x - box.x0;
    const gy = y - box.y0;
    const share = gx >= 0 && gy >= 0 && gx < box.w && gy < box.h ? grid[gy * box.w + gx]! : 0;
    return share > 0 ? share : undefined;
  };
}

export function readCells(isFloor: IsFloor, box: CellGrid, kept?: IsFloor, narrow?: NarrowShare): Cells {
  const read = (is: IsFloor): Uint8Array => {
    const grid = new Uint8Array(box.w * box.h);
    for (let gy = 0; gy < box.h; gy++) for (let gx = 0; gx < box.w; gx++) if (is(box.x0 + gx, box.y0 + gy)) grid[gy * box.w + gx] = 1;
    return grid;
  };
  const at = (grid: Uint8Array, outside: IsFloor): IsFloor => (x, y) => {
    const gx = x - box.x0;
    const gy = y - box.y0;
    return gx >= 0 && gy >= 0 && gx < box.w && gy < box.h ? grid[gy * box.w + gx] === 1 : outside(x, y);
  };
  return { box, floor: at(read(isFloor), isFloor), ...(kept && { kept: at(read(kept), () => false) }), ...(narrow && { narrow: readNarrow(narrow, box) }) };
}

/** The cells within one of any of `cells`, over the box grown by two: a corner there may have drawn them wrong. */
export function nearAny(cells: readonly CellPoint[], box: CellGrid): (p: Vec) => boolean {
  const x0 = box.x0 - 2;
  const y0 = box.y0 - 2;
  const w = box.w + 4;
  const h = box.h + 4;
  const grid = new Uint8Array(w * h);
  for (const c of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) grid[(c.y + dy - y0) * w + (c.x + dx - x0)] = 1;
  return (p) => {
    const gx = Math.floor(p.x) - x0;
    const gy = Math.floor(p.y) - y0;
    return gx >= 0 && gy >= 0 && gx < w && gy < h && grid[gy * w + gx] === 1;
  };
}
