/**
 * The lines a drop shows (§7.6): across the gap of a stack, along the gap of a
 * Row. Pure geometry over the boxes the card draws its blocks in, in any one
 * coordinate system.
 */

import type { Box, Point } from '../template-editor/gapGeometry';

export type { Box, Point };

/** A line between blocks: across a stack's gap, along a Row's. */
export interface DropLine {
  orientation: 'horizontal' | 'vertical';
  /** Where the line starts, */
  x: number;
  y: number;
  /** and how long it is. */
  length: number;
}

/** How a list lays out its blocks: one under the other (the top level, a Section) or side by side (a Row). */
export type ListFlow = 'stack' | 'row';

/** How far outside a block a line at the start or end of a list stands. */
export const LINE_OFFSET = 4;
/** How far blocks may overlap and still count as one after the other: runs of labelled lines stand 2 px apart. */
const SLACK = 4;

export function contains(box: Box, point: Point): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

/** Whether `after` follows `before` in the same column of a stack, or on the same line of a Row. */
export function follows(before: Box, after: Box, flow: ListFlow): boolean {
  if (flow === 'stack') return after.top >= before.bottom - SLACK && Math.min(before.right, after.right) > Math.max(before.left, after.left);
  return after.left >= before.right - SLACK && Math.min(before.bottom, after.bottom) > Math.max(before.top, after.top);
}

/** The box a line covers: no height across a stack's gap, no width along a Row's. */
export function lineBox(line: DropLine): Box {
  return line.orientation === 'horizontal'
    ? { left: line.x, top: line.y, right: line.x + line.length, bottom: line.y }
    : { left: line.x, top: line.y, right: line.x, bottom: line.y + line.length };
}

/** The distance from a point to a line. */
export function distanceTo(line: DropLine, point: Point): number {
  const along = line.orientation === 'horizontal' ? point.x - line.x : point.y - line.y;
  const across = line.orientation === 'horizontal' ? point.y - line.y : point.x - line.x;
  const outside = along < 0 ? -along : Math.max(0, along - line.length);
  return Math.hypot(outside, across);
}

function edgeLine(box: Box, flow: ListFlow, side: 'start' | 'end', span: Span | null): DropLine {
  if (flow === 'stack') {
    return { orientation: 'horizontal', x: box.left, y: side === 'start' ? box.top - LINE_OFFSET : box.bottom + LINE_OFFSET, length: box.right - box.left };
  }
  const { top, bottom } = span ?? box;
  return { orientation: 'vertical', x: side === 'start' ? box.left - LINE_OFFSET : box.right + LINE_OFFSET, y: top, length: bottom - top };
}

/** The height a Row's lines run: the Row's own while all its blocks stand on one line, else null (each block's). */
export interface Span {
  top: number;
  bottom: number;
}

/** A Row's height, where all its drawn blocks stand on one line (a Row wraps where the width runs out). */
export function rowSpan(row: Box | undefined, children: readonly Box[]): Span | null {
  if (!row || children.length === 0) return null;
  const top = Math.max(...children.map((box) => box.top));
  const bottom = Math.min(...children.map((box) => box.bottom));
  return top < bottom ? { top: row.top, bottom: row.bottom } : null;
}

/**
 * The line of the gap between `before` and `after` (either may be missing at
 * a list's ends). Neighbours that follow each other get the line in the
 * middle of their gap; neighbours in different columns (or lines of a
 * wrapped Row) get it at the edge nearer to `near`, else after `before`.
 */
export function gapLine(before: Box | null, after: Box | null, flow: ListFlow, span: Span | null, near: Point | null): DropLine | null {
  if (before && after && follows(before, after, flow)) {
    if (flow === 'stack') {
      const x = Math.min(before.left, after.left);
      return { orientation: 'horizontal', x, y: (before.bottom + after.top) / 2, length: Math.max(before.right, after.right) - x };
    }
    const { top, bottom } = span ?? { top: Math.min(before.top, after.top), bottom: Math.max(before.bottom, after.bottom) };
    return { orientation: 'vertical', x: (before.right + after.left) / 2, y: top, length: bottom - top };
  }
  const atEnd = before ? edgeLine(before, flow, 'end', span) : null;
  const atStart = after ? edgeLine(after, flow, 'start', span) : null;
  if (!atEnd || !atStart) return atEnd ?? atStart;
  return near && distanceTo(atStart, near) < distanceTo(atEnd, near) ? atStart : atEnd;
}
