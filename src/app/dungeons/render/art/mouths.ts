import { doorCells, doorMiddle } from '../../geometry';
import { mouthDepth } from '../houseShapes';
import type { DungeonDoor } from '../../model';
import type { Vec } from '../geometry';
import { rectPoly } from './paths';

/**
 * The ways out of a dungeon. An entrance is a clean opening at the dungeon's edge: its passage's
 * walls stop at the mouth, no wall closes it, and the rock parts in front of it, so the way leads
 * on into the open ground.
 */
export interface Mouth {
  door: DungeonDoor;
  /** The middle of the mouth, on the cell's outer edge. */
  at: Vec;
  /** Outwards, away from the dungeon. */
  out: Vec;
  /** Across, in cells: two for a cave's wide narrows. */
  width: number;
}

export function mouthsOf(dungeon: { doors: readonly DungeonDoor[] }): Mouth[] {
  return dungeon.doors
    .filter(door => door.from === null && door.kind !== 'secret')
    .map(door => {
      const cells = doorCells(door);
      // A cell door's mouth is its cell's outer edge; a door on an edge stands on the house's outer wall.
      const m = doorMiddle(door);
      const back = mouthDepth(door);
      return { door, out: { x: -door.dir.x, y: -door.dir.y }, at: { x: m.x - door.dir.x * back, y: m.y - door.dir.y * back }, width: cells.length };
    });
}

/** How far the rock stays parted in front of an entrance, and how much wider than its passage, in cells. */
const MOUTH_LANE = { length: 3.2, margin: 0.2 };

/** The open ground in front of a mouth: a strip `MOUTH_LANE` long and a little wider than the passage, where no rock stands. */
export function mouthLane({ at, out, width }: Mouth): Vec[] {
  const half = width / 2 + MOUTH_LANE.margin;
  const across = { x: -out.y * half, y: out.x * half };
  const far = { x: at.x + out.x * MOUTH_LANE.length, y: at.y + out.y * MOUTH_LANE.length };
  return [
    { x: at.x + across.x, y: at.y + across.y },
    { x: far.x + across.x, y: far.y + across.y },
    { x: far.x - across.x, y: far.y - across.y },
    { x: at.x - across.x, y: at.y - across.y },
  ];
}

/**
 * The ground just beyond a mouth, as wide as its passage and `depth` deep: no wall course or wall
 * ink lies there. Only as deep as what is drawn along the mouth's line reaches, since a floor may run
 * on beside the mouth, and its walls there keep their ink.
 */
export function mouthClearing(mouth: Mouth, depth: number): Vec[] {
  const { at, out } = mouth;
  const across = { x: -out.y * 0.5 * mouth.width, y: out.x * 0.5 * mouth.width };
  const corners = [-1, 1].flatMap(side => [0, depth].map(o => ({ x: at.x + across.x * side + out.x * o, y: at.y + across.y * side + out.y * o })));
  const xs = corners.map(p => p.x);
  const ys = corners.map(p => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return rectPoly({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 });
}
