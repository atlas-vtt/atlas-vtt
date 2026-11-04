/**
 * Where the `+` line between blocks goes (§7.6): the gap the pointer is in,
 * found from the boxes of one list's blocks. Pure geometry, in any one
 * coordinate system.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** How a list lays its blocks out: one under the other (a Section, the card's columns), or side by side (a Row). */
export type ListFlow = 'stack' | 'row';

export interface GapLine {
  /** The index the next block has in the list: where an insert at this gap goes. */
  index: number;
  /** The line: across the gap of a stack, or along the gap of a row. */
  orientation: 'horizontal' | 'vertical';
  /** Where the line starts, */
  x: number;
  y: number;
  /** and how long it is. */
  length: number;
}

/** How far into a block the pointer may be and still count as in the gap: runs of labelled lines stand 2 px apart. */
export const GAP_SLACK = 4;

function overlaps(start: number, end: number, low: number, high: number): boolean {
  return start <= high && end >= low;
}

/**
 * The gap between two neighbours of a list that holds the point, or null.
 * Neighbours of a stack must share a column (the card's columns put the next
 * block at the top of the next one); neighbours of a row the same line.
 */
export function gapAt(boxes: readonly Box[], point: Point, flow: ListFlow, slack: number = GAP_SLACK): GapLine | null {
  for (let index = 1; index < boxes.length; index++) {
    const before = boxes[index - 1];
    const after = boxes[index];
    if (!before || !after) continue;
    if (flow === 'stack') {
      const left = Math.max(before.left, after.left);
      const right = Math.min(before.right, after.right);
      if (after.top < before.bottom - slack || right < left) continue;
      if (point.y < before.bottom - slack || point.y > after.top + slack || point.x < left || point.x > right) continue;
      const from = Math.min(before.left, after.left);
      return { index, orientation: 'horizontal', x: from, y: (before.bottom + after.top) / 2, length: Math.max(before.right, after.right) - from };
    }
    if (after.left < before.right - slack || !overlaps(before.top, before.bottom, after.top, after.bottom)) continue;
    const top = Math.max(before.top, after.top);
    const bottom = Math.min(before.bottom, after.bottom);
    if (point.x < before.right - slack || point.x > after.left + slack || point.y < top || point.y > bottom) continue;
    const from = Math.min(before.top, after.top);
    return { index, orientation: 'vertical', x: (before.right + after.left) / 2, y: from, length: Math.max(before.bottom, after.bottom) - from };
  }
  return null;
}
