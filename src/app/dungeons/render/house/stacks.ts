/**
 * A chimney stack as the floor plan cuts it: coursed masonry in the look's own manner (brick where
 * the look builds in brick, dressed stone elsewhere), its courses running along the stack, and a
 * flue at each end, a sooted hole lined with a parging of mortar.
 */

import type { DungeonStack } from '../../model';
import type { DungeonStyle } from '../../style';
import type { Hand } from '../art/hand';
import { polyPath, rectPoly } from '../art/paths';
import type { Vec } from '../geometry';
import { INNER_WALL } from '../houseShapes';

/** A course's height and a unit's length, in cells: bricks where the look's surround is brick, else stone. */
export function masonryCourse(style: Pick<DungeonStyle, 'surround'>): { height: number; length: number } {
  return style.surround.mode === 'bricks' ? { height: 0.075, length: 0.22 } : { height: 0.12, length: 0.36 };
}

/** A flue's size across and along the stack, and how far from the stack's middle each lies. */
const FLUE = { across: 0.24, along: 0.2, from: 0.48, lining: 0.035 };

export function drawStack(hand: Hand, stack: DungeonStack): void {
  const grow = INNER_WALL / 2;
  const box = { x: stack.x - grow, y: stack.y - grow, w: stack.w + grow * 2, h: stack.h + grow * 2 };
  const long = stack.w >= stack.h;
  const outline = rectPoly(box);
  hand.surface(polyPath(outline), 'dressed');
  hand.line(courses(hand, box, long), 'fine');
  const mid = { x: stack.x + stack.w / 2, y: stack.y + stack.h / 2 };
  const ends = (long ? stack.w : stack.h) > 1 ? [-1, 1] : [0];
  for (const side of ends) {
    const c = long ? { x: mid.x + side * FLUE.from, y: mid.y } : { x: mid.x, y: mid.y + side * FLUE.from };
    flue(hand, c, long);
  }
  hand.edges(outline, true);
}

/** Bed joints along the stack and head joints across each course, every other course offset by half a unit. */
function courses(hand: Hand, box: { x: number; y: number; w: number; h: number }, long: boolean): Vec[][] {
  const { height, length } = masonryCourse(hand.scene.env.style);
  const lines: Vec[][] = [];
  const [along0, along1, across0, across1] = long ? [box.x, box.x + box.w, box.y, box.y + box.h] : [box.y, box.y + box.h, box.x, box.x + box.w];
  const at = (u: number, v: number): Vec => (long ? { x: u, y: v } : { x: v, y: u });
  const rows = Math.max(2, Math.round((across1 - across0) / height));
  const step = (across1 - across0) / rows;
  for (let r = 0; r < rows; r++) {
    const v0 = across0 + r * step;
    if (r > 0) lines.push([at(along0, v0), at(along1, v0)]);
    for (let u = along0 + (r % 2 ? length / 2 : length); u < along1 - 0.03; u += length) lines.push([at(u, v0), at(u, v0 + step)]);
  }
  return lines;
}

/** A flue: a sooted hole going down into the dark, a parging of mortar round its mouth. */
function flue(hand: Hand, c: Vec, long: boolean): void {
  const [w, h] = long ? [FLUE.along, FLUE.across] : [FLUE.across, FLUE.along];
  const lining = rectPoly({ x: c.x - w / 2 - FLUE.lining, y: c.y - h / 2 - FLUE.lining, w: w + FLUE.lining * 2, h: h + FLUE.lining * 2 });
  const hole = rectPoly({ x: c.x - w / 2, y: c.y - h / 2, w, h });
  hand.surface(polyPath(lining), 'dressed');
  hand.surface(polyPath(hole), 'stone');
  const bounds = { minX: c.x - w, minY: c.y - h, maxX: c.x + w, maxY: c.y + h };
  hand.tone((x, y) => 0.75 + 0.25 * Math.min(1, 1 - Math.max(Math.abs(x - c.x) / (w / 2), Math.abs(y - c.y) / (h / 2))), bounds, polyPath(hole), 'depth');
  hand.edges(hole, false);
  hand.line([lining], 'fine', true);
}
