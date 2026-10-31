import type { DungeonDoor } from '../../../model';
import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { wayFrame, type WayFrame } from './narrows';

/**
 * A narrow way's neck as the floor's outline draws it: the cave's own rock closes in to one cell
 * there (`holdNecks`), so a crawl, a squeeze and a letterbox draw no rock of their own, only their
 * survey marks, which hang from the real walls' faces. A face is found where it stands, since the
 * outline wanders round a door cell.
 */

/** The nearest the marks come to the way's middle, which stays clear, in cells. */
export const INNER = 0.14;
/** The farthest out a wall is looked for: past it no wall stands near enough to hang a mark from. */
export const OUTER = 0.95;
/** How far into the rock a mark that touches a wall starts, so the floor clip cuts it at the wall's face. */
export const INTO_ROCK = 0.06;

/** A one-cell frame on the door's own cell: a narrow way is never wide. */
export function pinchFrame(door: DungeonDoor): WayFrame {
  return wayFrame({ x: door.x, y: door.y, w: 1, h: 1 }, door.dir);
}

/**
 * How far out from the way's middle the floor ends on `side` (−1 or 1) at `v` along it, found to a
 * hundredth of a cell; `OUTER` where no wall stands that near.
 */
export type NeckFace = (side: number, v: number) => number;

/** The faces of the walls round the door cell of `frame`, read off the floor's outline. */
export function neckFaces(hand: Hand, frame: WayFrame): NeckFace {
  const { field } = hand.scene.env.dungeon;
  const inFloor = (p: Vec): boolean => field.distance(p.x, p.y) < 0;
  return (side, v) => {
    const at = (u: number): Vec => frame.at(side * u, v);
    if (inFloor(at(OUTER))) return OUTER;
    let lo = INNER;
    let hi = OUTER;
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2;
      if (inFloor(at(mid))) lo = mid;
      else hi = mid;
    }
    return lo;
  };
}
