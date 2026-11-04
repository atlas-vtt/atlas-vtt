/**
 * Room made in the list a block was picked up from (§7.6): while it is held
 * over another place in that same list, the blocks it passes slide over by
 * its size and its own frame (dimmed) stands where it will land. Only by
 * transform, so nothing reflows. Lists that do not lay their blocks along one
 * line (the card's columns, a wrapped Row) stay still and show the line alone.
 * Pure.
 */

import { follows, LINE_OFFSET, type Box, type DropLine, type ListFlow } from './dropGeometry';

export interface ListEntry {
  id: string;
  box: Box;
}

export interface Shift {
  x: number;
  y: number;
}

export interface ShiftPlan {
  /** By how much each frame slides, the moved block's own included. */
  shifts: ReadonlyMap<string, Shift>;
  /** Where the moved block's frame stands once shifted, */
  landing: Box;
  /** and the line drawn at its leading edge. */
  line: DropLine;
}

const startOf = (box: Box, flow: ListFlow): number => (flow === 'stack' ? box.top : box.left);
const endOf = (box: Box, flow: ListFlow): number => (flow === 'stack' ? box.bottom : box.right);
const along = (distance: number, flow: ListFlow): Shift => (flow === 'stack' ? { x: 0, y: distance } : { x: distance, y: 0 });

/**
 * The shifts for the block at drawn position `from` held over the gap at
 * drawn position `gap` (0 before the first block, `entries.length` after the
 * last) of its own list; null where nothing slides.
 */
export function siblingShifts(entries: readonly ListEntry[], from: number, gap: number, flow: ListFlow): ShiftPlan | null {
  const moving = entries[from];
  if (!moving || gap === from || gap === from + 1 || gap < 0 || gap > entries.length) return null;
  for (let index = 1; index < entries.length; index++) {
    const before = entries[index - 1];
    const after = entries[index];
    if (before && after && !follows(before.box, after.box, flow)) return null;
  }
  const size = endOf(moving.box, flow) - startOf(moving.box, flow);
  const shifts = new Map<string, Shift>();
  let landingStart: number;
  let room: number;
  /** The gap the line stands in: between the landing place and the block before it. */
  let open: number;
  if (gap > from) {
    const next = entries[from + 1];
    const last = entries[gap - 1];
    if (!next || !last) return null;
    room = startOf(next.box, flow) - startOf(moving.box, flow);
    for (let index = from + 1; index < gap; index++) {
      const entry = entries[index];
      if (entry) shifts.set(entry.id, along(-room, flow));
    }
    landingStart = endOf(last.box, flow) - size;
    open = room - size;
  } else {
    const previous = entries[from - 1];
    const first = entries[gap];
    if (!previous || !first) return null;
    room = startOf(moving.box, flow) - endOf(previous.box, flow) + size;
    for (let index = gap; index < from; index++) {
      const entry = entries[index];
      if (entry) shifts.set(entry.id, along(room, flow));
    }
    landingStart = startOf(first.box, flow);
    // Blocks of one list need not stand equally far apart (a divider keeps more room than two values do):
    // the gap is the one before the landing place, never the one the block had where it came from.
    const before = entries[gap - 1];
    open = before ? landingStart - endOf(before.box, flow) : room - size;
  }
  const offset = landingStart - startOf(moving.box, flow);
  shifts.set(moving.id, along(offset, flow));
  const box = moving.box;
  const landing = flow === 'stack'
    ? { ...box, top: box.top + offset, bottom: box.bottom + offset }
    : { ...box, left: box.left + offset, right: box.right + offset };
  const lead = landingStart - Math.max(open / 2, LINE_OFFSET / 2);
  const line: DropLine = flow === 'stack'
    ? { orientation: 'horizontal', x: landing.left, y: lead, length: landing.right - landing.left }
    : { orientation: 'vertical', x: lead, y: landing.top, length: landing.bottom - landing.top };
  return { shifts, landing, line };
}
