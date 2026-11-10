/**
 * Where an ability dragged in its list may go (spec §7.2). Pure: the boxes of
 * the list's items in, the clamp, the gap and the slides out, all in one
 * coordinate system.
 *
 * A list split across the card's CSS columns is a set of fragments: the
 * boxes of its items grouped by column (an item split across two columns
 * gives a box to each). The pointer is clamped into the nearest fragment, so
 * nothing outside the list is ever a target; the gap is counted in the
 * list's order, and only the items of the moved item's own fragment slide.
 */

import { gapLine, type Box, type DropLine, type Point } from './dropGeometry';
import { siblingShifts, type ShiftPlan } from './siblingShifts';

export interface ListItemBoxes {
  key: string;
  /** The item's boxes in reading order: one, or one per column it runs through. */
  rects: readonly Box[];
}

export type Fragment = Box;

/** How close two boxes' left edges must be to stand in one column. */
const SNAP = 2;

/** The list's fragments, one per column it runs through, left to right. */
export function fragmentsOf(items: readonly ListItemBoxes[]): Fragment[] {
  const fragments: Fragment[] = [];
  for (const rect of items.flatMap((item) => item.rects)) {
    const same = fragments.find((fragment) => Math.abs(fragment.left - rect.left) <= SNAP);
    if (!same) {
      fragments.push({ ...rect });
      continue;
    }
    same.top = Math.min(same.top, rect.top);
    same.bottom = Math.max(same.bottom, rect.bottom);
    same.right = Math.max(same.right, rect.right);
  }
  return fragments.sort((a, b) => a.left - b.left);
}

function distanceToBox(box: Box, point: Point): number {
  const dx = Math.max(box.left - point.x, 0, point.x - box.right);
  const dy = Math.max(box.top - point.y, 0, point.y - box.bottom);
  return Math.hypot(dx, dy);
}

export interface Clamped {
  /** The point moved into the nearest fragment. */
  point: Point;
  fragment: number;
  /** How far the pointer pulled past the fragment's edge. */
  pulled: number;
}

/** The point held inside the list: in the fragment nearest to it. */
export function clampToList(fragments: readonly Fragment[], point: Point): Clamped | null {
  let best = -1;
  let distance = Infinity;
  fragments.forEach((fragment, index) => {
    const away = distanceToBox(fragment, point);
    if (away < distance) [best, distance] = [index, away];
  });
  const fragment = fragments[best];
  if (!fragment) return null;
  const x = Math.min(Math.max(point.x, fragment.left), fragment.right);
  const y = Math.min(Math.max(point.y, fragment.top), fragment.bottom);
  return { point: { x, y }, fragment: best, pulled: distance };
}

function inFragment(rect: Box, fragment: Fragment): boolean {
  return Math.abs(rect.left - fragment.left) <= SNAP;
}

/**
 * The gap at a point of a fragment, counted in the list's order: 0 before
 * the first item, `items.length` after the last. Over an item's upper half
 * the gap before it, over its lower half the gap after it.
 */
export function gapAt(items: readonly ListItemBoxes[], fragment: Fragment, y: number): number {
  let lastHere = -1;
  for (let index = 0; index < items.length; index++) {
    const rect = items[index]?.rects.find((box) => inFragment(box, fragment));
    if (!rect) continue;
    if (y < (rect.top + rect.bottom) / 2) return index;
    lastHere = index;
  }
  return lastHere + 1;
}

/** The line of a gap: across the list's width, between the item before it and the one after it. */
export function gapLineOf(items: readonly ListItemBoxes[], gap: number): DropLine | null {
  const before = items[gap - 1]?.rects.at(-1) ?? null;
  const after = items[gap]?.rects[0] ?? null;
  return gapLine(before, after, 'stack', null, null);
}

/** Whether a gap leaves the moved item where it is. */
export function isNoMove(from: number, gap: number): boolean {
  return gap === from || gap === from + 1;
}

/** Where the moved item stands once dropped at `gap`, counted in the list without it: what a move patch names. */
export function droppedIndex(from: number, gap: number): number {
  return gap > from ? gap - 1 : gap;
}

/**
 * The slides that open the gap, where the moved item and every item it
 * passes stand in one fragment, each in one box; null elsewhere (the line
 * alone shows the place).
 */
export function slidesFor(items: readonly ListItemBoxes[], from: number, gap: number): ShiftPlan | null {
  const moving = items[from];
  const box = moving?.rects.length === 1 ? moving.rects[0] : undefined;
  if (!box || isNoMove(from, gap)) return null;
  const column: Array<{ id: string; box: Box; at: number }> = [];
  items.forEach((item, at) => {
    const only = item.rects.length === 1 ? item.rects[0] : undefined;
    if (only && Math.abs(only.left - box.left) <= SNAP) column.push({ id: item.key, box: only, at });
  });
  const lo = Math.min(from, gap);
  const hi = Math.max(from + 1, gap);
  // Every item between the two places must be in the column, or they lie in another fragment.
  for (let at = lo; at < hi; at++) if (!column.some((entry) => entry.at === at)) return null;
  const local = column.findIndex((entry) => entry.at === from);
  const localGap = column.findIndex((entry) => entry.at >= gap);
  return siblingShifts(column, local, localGap === -1 ? column.length : localGap, 'stack');
}
