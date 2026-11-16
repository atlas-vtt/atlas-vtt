/** What each cell of a house's lot holds while its grounds are laid out, as bits over the lot's box. */

import type { CellPoint } from '../../model';
import type { Box } from './houseGrid';

/** Nothing more may stand on the cell. */
export const TAKEN = 1;
/** The cell is a way's: the way in or a walk. */
export const WAY = 2;
/** The cell is an outbuilding's. */
export const BUILDING = 4;

export class LotGrid {
  private readonly bits: Uint8Array;

  constructor(readonly lot: Box) {
    this.bits = new Uint8Array(lot.w * lot.h);
  }

  /** The cell's index in the lot, or -1 off it. */
  index(x: number, y: number): number {
    const { lot } = this;
    return x >= lot.x && y >= lot.y && x < lot.x + lot.w && y < lot.y + lot.h ? (y - lot.y) * lot.w + (x - lot.x) : -1;
  }

  has(c: CellPoint, bit: number): boolean {
    const i = this.index(c.x, c.y);
    return i >= 0 && (this.bits[i]! & bit) !== 0;
  }

  /** Whether the cell lies on the lot and nothing stands on it. */
  free(c: CellPoint): boolean {
    const i = this.index(c.x, c.y);
    return i >= 0 && (this.bits[i]! & TAKEN) === 0;
  }

  /** The bits of the cell at `index`. */
  at(index: number): number {
    return this.bits[index]!;
  }

  mark(cells: readonly CellPoint[], bit: number): void {
    for (const c of cells) {
      const i = this.index(c.x, c.y);
      if (i >= 0) this.bits[i] = this.bits[i]! | bit;
    }
  }

  clear(cells: readonly CellPoint[], bit: number): void {
    for (const c of cells) {
      const i = this.index(c.x, c.y);
      if (i >= 0) this.bits[i] = this.bits[i]! & ~bit;
    }
  }
}
