/**
 * Where a target's handle stands (spec §3.3). Pure: boxes in, a centre out,
 * all in client coordinates.
 *
 * The handle lives in the gutter left of the target's column: the card's
 * padding for the first column, the column gap for later ones. Nested blocks
 * and abilities take their column's gutter (Sections do not indent), so the
 * handle's x never jumps down a column; its y is the middle of the target's
 * first line. A target that does not start at its column's edge (a later
 * child of Side by side) has no gutter: its handle turns and hangs above its
 * top-left corner.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Column {
  left: number;
  right: number;
}

export interface HandlePlacement {
  /** The handle's centre. */
  x: number;
  y: number;
  orientation: 'vertical' | 'horizontal';
}

/** The handle's hit area: 24 × 24 (WCAG 2.5.8). */
export const HANDLE_SIZE = 24;
/** How close a target's left edge must be to a column's to stand in its gutter. */
const SNAP = 2;

/** The card's columns, from the boxes its top-level blocks are drawn in (a block split across columns gives a box per column). */
export function columnsOf(boxes: readonly Box[]): Column[] {
  const columns: Column[] = [];
  for (const box of boxes) {
    const same = columns.find((column) => Math.abs(column.left - box.left) <= SNAP);
    if (same) same.right = Math.max(same.right, box.right);
    else columns.push({ left: box.left, right: box.right });
  }
  return columns.sort((a, b) => a.left - b.left);
}

/** The free strip left of a column: from the card's edge (first column) or the column before (later ones). */
export function gutterOf(columns: readonly Column[], index: number, cardLeft: number): Column {
  const column = columns[index];
  if (!column) return { left: cardLeft, right: cardLeft };
  const before = columns[index - 1];
  return { left: before ? before.right : cardLeft, right: column.left };
}

/** How far a turned handle may reach above the card's top edge into nothing: it stays within the card's padding. */
const ABOVE_CARD = 4;

/**
 * The handle of a target whose box is `target` and whose first line spans
 * `firstLine` (top and bottom). `cardLeft` is the card's outer left edge,
 * `cardTop` its top edge: a turned handle never hangs above it.
 */
export function placeHandle(
  target: Box, firstLine: { top: number; bottom: number }, columns: readonly Column[], cardLeft: number, cardTop = -Infinity,
): HandlePlacement {
  const y = (firstLine.top + firstLine.bottom) / 2;
  // The column the target stands in: the last one starting at or before it.
  let index = -1;
  columns.forEach((column, at) => {
    if (column.left <= target.left + SNAP) index = at;
  });
  const column = columns[index];
  if (!column || target.left - column.left > SNAP) {
    const y = Math.max(target.top - HANDLE_SIZE / 2, cardTop + HANDLE_SIZE / 2 - ABOVE_CARD);
    return { x: target.left + HANDLE_SIZE / 2, y, orientation: 'horizontal' };
  }
  const gutter = gutterOf(columns, index, cardLeft);
  return { x: (gutter.left + gutter.right) / 2, y, orientation: 'vertical' };
}
