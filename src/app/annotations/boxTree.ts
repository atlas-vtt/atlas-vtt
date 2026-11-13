/**
 * Boxes in a tree, so that asking which of them touch a place reads a handful and not all: each
 * node holds the box around everything below it, and a question skips every node whose box it
 * misses. Built once from a list that then stays as it is; boxes of any size mix freely, where a
 * grid of cells would have to list a large box in every cell it covers.
 */

import type { Box } from '../vision/polygonBounds';

/** The most boxes a node holds before it is split in two. */
const LEAF_SIZE = 8;

export class BoxTree {
  /** Four numbers per node: the box around all below it. */
  private readonly bounds: Float64Array;
  /** Two numbers per node: for a leaf the place of its first box in `order` and their number, else its two children and 0. */
  private readonly links: Int32Array;
  private readonly leafSizes: Int32Array;
  /** The boxes' indexes, the boxes of one leaf side by side. */
  private readonly order: Int32Array;
  private nodes = 0;

  /** A box with a number that is none (a text nobody could measure) is in no answer. */
  constructor(private readonly boxes: readonly Box[]) {
    const sound: number[] = [];
    boxes.forEach((box, index) => {
      if (Number.isFinite(box.minX) && Number.isFinite(box.minY) && Number.isFinite(box.maxX) && Number.isFinite(box.maxY)) sound.push(index);
    });
    this.order = Int32Array.from(sound);
    const most = Math.max(1, 2 * Math.ceil(sound.length / Math.ceil(LEAF_SIZE / 2)));
    this.bounds = new Float64Array(4 * most);
    this.links = new Int32Array(2 * most);
    this.leafSizes = new Int32Array(most);
    if (sound.length > 0) this.build(0, sound.length);
  }

  private build(from: number, to: number): number {
    const node = this.nodes++;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    // The middles' spread decides which way the node is split.
    let midMinX = Infinity;
    let midMinY = Infinity;
    let midMaxX = -Infinity;
    let midMaxY = -Infinity;
    for (let i = from; i < to; i++) {
      const box = this.boxes[this.order[i]!]!;
      if (box.minX < minX) minX = box.minX;
      if (box.minY < minY) minY = box.minY;
      if (box.maxX > maxX) maxX = box.maxX;
      if (box.maxY > maxY) maxY = box.maxY;
      const midX = box.minX + box.maxX;
      const midY = box.minY + box.maxY;
      if (midX < midMinX) midMinX = midX;
      if (midX > midMaxX) midMaxX = midX;
      if (midY < midMinY) midMinY = midY;
      if (midY > midMaxY) midMaxY = midY;
    }
    this.bounds.set([minX, minY, maxX, maxY], 4 * node);
    if (to - from <= LEAF_SIZE) {
      this.links[2 * node] = from;
      this.leafSizes[node] = to - from;
      return node;
    }
    const middle = (from + to) >> 1;
    this.halve(from, to, middle, midMaxX - midMinX >= midMaxY - midMinY);
    this.links[2 * node] = this.build(from, middle);
    this.links[2 * node + 1] = this.build(middle, to);
    return node;
  }

  /**
   * Orders the boxes at `from` to `to` so that those before `middle` have their middles no farther
   * along the axis than those after it. Only the halves matter, not the order within them, so
   * this is a selection (Hoare's), which looks at each box a couple of times where a sort would
   * compare it with a dozen others.
   */
  private halve(from: number, to: number, middle: number, across: boolean): void {
    const { order, boxes } = this;
    const key = (index: number): number => {
      const box = boxes[index]!;
      return across ? box.minX + box.maxX : box.minY + box.maxY;
    };
    let low = from;
    let high = to - 1;
    while (low < high) {
      const pivot = key(order[(low + high) >> 1]!);
      let i = low;
      let j = high;
      while (i <= j) {
        while (key(order[i]!) < pivot) i++;
        while (key(order[j]!) > pivot) j--;
        if (i <= j) {
          const swapped = order[i]!;
          order[i] = order[j]!;
          order[j] = swapped;
          i++;
          j--;
        }
      }
      if (middle <= j) high = j;
      else if (middle >= i) low = i;
      else return;
    }
  }

  /** The indexes of the boxes that touch the box from (minX, minY) to (maxX, maxY), smallest first. */
  touching(minX: number, minY: number, maxX: number, maxY: number): number[] {
    const found: number[] = [];
    if (this.nodes === 0) return found;
    const { bounds, links, leafSizes, order, boxes } = this;
    const waiting = [0];
    while (waiting.length > 0) {
      const node = waiting.pop()!;
      const at = 4 * node;
      if (bounds[at]! > maxX || bounds[at + 1]! > maxY || bounds[at + 2]! < minX || bounds[at + 3]! < minY) continue;
      const size = leafSizes[node]!;
      if (size === 0) {
        waiting.push(links[2 * node]!, links[2 * node + 1]!);
        continue;
      }
      const first = links[2 * node]!;
      for (let i = first; i < first + size; i++) {
        const index = order[i]!;
        const box = boxes[index]!;
        if (box.minX <= maxX && box.minY <= maxY && box.maxX >= minX && box.maxY >= minY) found.push(index);
      }
    }
    return found.sort((a, b) => a - b);
  }
}
