import type { Point } from '../types/visionTypes';
import type { Segment } from './wallSides';

/**
 * Segments filed by the square cells of a grid, so that the few near a place are found without
 * looking at all of them: what the rooms mode asks of a map's walls and of its floor's outline,
 * thousands of times per edit. A grid only narrows the search; whoever asks still tests what it hands out.
 */

/** A box with its sides along the axes. */
export interface Box { left: number; top: number; right: number; bottom: number }

export interface SegmentGrid<T extends Segment> {
  /** The segments of the cell `point` lies in, in the order they were given: every one that comes within the grid's reach of the point, and others. */
  near(point: Point): readonly T[];
  /** Every segment that comes within the grid's reach of `box`, and others, each once, in the order they were given. */
  touching(box: Box): T[];
}

/** The smallest cell's side, in pixels, and how often a segment may be filed on average before cells are made larger. */
const LEAST_CELL = 16;
const MOST_FILED = 8;

const NONE: readonly never[] = [];

export function boxOf({ p1, p2 }: Segment): Box {
  return { left: Math.min(p1.x, p2.x), top: Math.min(p1.y, p2.y), right: Math.max(p1.x, p2.x), bottom: Math.max(p1.y, p2.y) };
}

export function grown({ left, top, right, bottom }: Box, by: number): Box {
  return { left: left - by, top: top - by, right: right + by, bottom: bottom + by };
}

export const boxesMeet = (a: Box, b: Box): boolean => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

/** The box round all of `segments`, or null where there is none. */
export function boxAround(segments: readonly Segment[]): Box | null {
  if (segments.length === 0) return null;
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const segment of segments) {
    const { left, top, right, bottom } = boxOf(segment);
    box.left = Math.min(box.left, left);
    box.top = Math.min(box.top, top);
    box.right = Math.max(box.right, right);
    box.bottom = Math.max(box.bottom, bottom);
  }
  return box;
}

const finite = ({ left, top, right, bottom }: Box): boolean => Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom);
/** Farthest place from zero (px) cells are counted at, far beyond any map: past it a column's number is no longer exact. */
const MAX_PLACE = 1e9;
const placeable = ({ left, top, right, bottom }: Box): boolean => left >= -MAX_PLACE && top >= -MAX_PLACE && right <= MAX_PLACE && bottom <= MAX_PLACE;

/**
 * `segments` filed for questions about what comes within `reach` pixels of a place. A segment is
 * filed in every cell its box, grown by the reach, touches; cells grow until that is few cells per
 * segment, so one long slanted wall does not fill the grid. A segment with an end that is no
 * finite number is near nothing and is left out; where one lies farther out than cells are counted
 * (a damaged file), nothing is filed and every question is answered with all of them.
 */
export function segmentGrid<T extends Segment>(segments: readonly T[], reach: number): SegmentGrid<T> {
  const boxes: (Box | null)[] = segments.map((segment) => {
    const box = grown(boxOf(segment), reach);
    return finite(box) ? box : null;
  });
  const within = (box: Box): T[] => segments.filter((_, index) => {
    const own = boxes[index];
    return own ? boxesMeet(own, box) : false;
  });
  if (boxes.some((box) => box !== null && !placeable(box))) return { near: () => segments, touching: within };
  let cell = LEAST_CELL;
  const filed = (): number => boxes.reduce((sum, box) => sum + (box ? (Math.floor(box.right / cell) - Math.floor(box.left / cell) + 1) * (Math.floor(box.bottom / cell) - Math.floor(box.top / cell) + 1) : 0), 0);
  while (filed() > MOST_FILED * segments.length + 64 && Number.isFinite(cell * 2)) cell *= 2;

  // A cell's key from its column and row. Two cells far apart may share one; that only lengthens a list.
  const key = (column: number, row: number): number => column * 73856093 + row * 19349663;
  const cells = new Map<number, number[]>();
  boxes.forEach((box, index) => {
    if (!box) return;
    for (let column = Math.floor(box.left / cell); column <= Math.floor(box.right / cell); column++) {
      for (let row = Math.floor(box.top / cell); row <= Math.floor(box.bottom / cell); row++) {
        const at = key(column, row);
        const list = cells.get(at);
        if (list) list.push(index);
        else cells.set(at, [index]);
      }
    }
  });
  const lists = new Map<number, readonly T[]>();
  const seen = new Uint32Array(segments.length);
  let question = 0;

  return {
    near(point: Point): readonly T[] {
      if (!(Math.abs(point.x) <= MAX_PLACE && Math.abs(point.y) <= MAX_PLACE)) return segments;
      const at = key(Math.floor(point.x / cell), Math.floor(point.y / cell));
      let list = lists.get(at);
      if (!list) lists.set(at, list = cells.get(at)?.map((index) => segments[index]!) ?? NONE);
      return list;
    },
    touching(box: Box): T[] {
      if (!finite(box)) return [];
      if (!placeable(box)) return within(box);
      const [fromColumn, toColumn, fromRow, toRow] = [Math.floor(box.left / cell), Math.floor(box.right / cell), Math.floor(box.top / cell), Math.floor(box.bottom / cell)];
      // A box over more cells than there are filled ones: every segment is looked at once instead.
      if ((toColumn - fromColumn + 1) * (toRow - fromRow + 1) > cells.size) return within(box);
      if (++question === 2 ** 32) {
        seen.fill(0);
        question = 1;
      }
      const found: number[] = [];
      for (let column = fromColumn; column <= toColumn; column++) {
        for (let row = fromRow; row <= toRow; row++) {
          for (const index of cells.get(key(column, row)) ?? NONE) {
            if (seen[index] === question) continue;
            seen[index] = question;
            if (boxesMeet(boxes[index]!, box)) found.push(index);
          }
        }
      }
      return found.sort((a, b) => a - b).map((index) => segments[index]!);
    },
  };
}
