/**
 * The rooms of a floor, by the blocks of cells their rectangles cover, so what a room meets is
 * asked of the few rooms near it: a cave floor tries thousands of rooms against up to four hundred
 * while it grows, and pairs up every two that touch for its loops, and asking each room took most
 * of an attempt.
 */

import { type CellRect, rectsClash, rectsTouch } from '../geometry';

/** The side of a block, in cells. */
const BLOCK = 8;
/** Keeps block coordinates of either sign apart in one number, small enough to stay a small integer. */
const SPAN = 1 << 12;

const blockOf = (cell: number): number => Math.floor(cell / BLOCK);
const blockKey = (bx: number, by: number): number => (bx + SPAN) * 2 * SPAN + (by + SPAN);

export class RoomIndex {
  private readonly blocks = new Map<number, number[]>();
  private readonly rects: CellRect[] = [];
  /** The last ask each room was looked at in, so a room in several blocks is looked at once. */
  private readonly seen: number[] = [];
  private asks = 0;

  add(id: number, rect: CellRect): void {
    this.rects[id] = rect;
    this.seen[id] = 0;
    for (let by = blockOf(rect.y0); by <= blockOf(rect.y1); by++) {
      for (let bx = blockOf(rect.x0); bx <= blockOf(rect.x1); bx++) {
        const key = blockKey(bx, by);
        const ids = this.blocks.get(key);
        if (ids) ids.push(id);
        else this.blocks.set(key, [id]);
      }
    }
  }

  /** The rooms whose rectangles share a cell with `rect` (`rectsTouch`), by id, least first. */
  touching(rect: CellRect): number[] {
    const ask = ++this.asks;
    const out: number[] = [];
    for (let by = blockOf(rect.y0); by <= blockOf(rect.y1); by++) {
      for (let bx = blockOf(rect.x0); bx <= blockOf(rect.x1); bx++) {
        for (const id of this.blocks.get(blockKey(bx, by)) ?? []) {
          if (this.seen[id] === ask) continue;
          this.seen[id] = ask;
          if (rectsTouch(rect, this.rects[id] as CellRect)) out.push(id);
        }
      }
    }
    return out.sort((a, b) => a - b);
  }

  /** Whether a room not in `ignore` overlaps `rect` by more than a shared wall (`rectsClash`). */
  clashes(rect: CellRect, ignore: ReadonlySet<number>): boolean {
    const ask = ++this.asks;
    for (let by = blockOf(rect.y0); by <= blockOf(rect.y1); by++) {
      for (let bx = blockOf(rect.x0); bx <= blockOf(rect.x1); bx++) {
        for (const id of this.blocks.get(blockKey(bx, by)) ?? []) {
          if (this.seen[id] === ask) continue;
          this.seen[id] = ask;
          if (!ignore.has(id) && rectsClash(rect, this.rects[id] as CellRect)) return true;
        }
      }
    }
    return false;
  }
}
