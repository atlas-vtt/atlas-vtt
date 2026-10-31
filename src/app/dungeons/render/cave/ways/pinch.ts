import type { DungeonDoor } from '../../../model';
import type { Rng } from '../../../rng';
import type { Hand } from '../../art/hand';
import { polyPath } from '../../art/paths';
import type { Vec } from '../../geometry';
import { wayFrame, type WayFrame } from './narrows';
import { clipped, clipToFloor } from './wayDoors';

/**
 * A way pinched to less than its cell: the rock of both walls bulges in over the door cell's floor
 * and leaves a gap down the middle. The bulge lies inside the floor's outline, so the wall ink
 * where the scene's walls stand is never covered; the cell stays walkable in the model, so the gap
 * is kept clear of ink from mouth to mouth and the way never reads as a wall across.
 */

/** Where the rock reaches to beyond the floor's outline, in cells from the way's middle; the floor clip trims it there. */
const BEYOND = 0.62;
/** How far along the way the bulge runs either side of the door cell's middle. */
const REACH = 0.47;

/** A one-cell frame on the door's own cell: a pinched way is never wide. */
export function pinchFrame(door: DungeonDoor): WayFrame {
  return wayFrame({ x: door.x, y: door.y, w: 1, h: 1 }, door.dir);
}

/**
 * One wall's bulge, `side` −1 or 1: its face from one mouth to the other as `face` gives it, `v`
 * from −REACH to REACH, then back round through the rock behind.
 */
function bulge(frame: WayFrame, side: number, face: readonly { u: number; v: number }[]): Vec[] {
  const p = (u: number, v: number): Vec => frame.at(side * u, v);
  return [p(BEYOND, -REACH), ...face.map(({ u, v }) => p(u, v)), p(BEYOND, REACH)];
}

/** A squeeze's face: wide at the mouths, closing to `opening` / 2 at the middle, broken into sharp teeth. */
export function squeezeFace(rng: Rng, opening: number, teeth: number, tooth: number): { u: number; v: number }[] {
  const face: { u: number; v: number }[] = [];
  const steps = teeth * 2;
  for (let k = 0; k <= steps; k++) {
    const v = -REACH + (2 * REACH * k) / steps;
    const flare = (Math.abs(v) / REACH) ** 2 * 0.3;
    const jag = k === 0 || k === steps ? 0 : (k % 2 ? tooth : -tooth) * (0.8 + 0.4 * rng());
    face.push({ u: opening / 2 + tooth + flare + jag, v });
  }
  return face;
}

/** A letterbox's face: flat and straight where the slot is, opening out sharply at both mouths. */
export function slotFace(opening: number, length: number): { u: number; v: number }[] {
  const half = opening / 2;
  return [{ u: 0.5, v: -REACH + 0.02 }, { u: half + 0.2, v: -length - 0.1 }, { u: half, v: -length }, { u: half, v: length }, { u: half + 0.2, v: length + 0.1 }, { u: 0.5, v: REACH - 0.02 }];
}

/** Draws both bulges of a pinched way, with `details` (fine lines in the rock) for each side, over the floor only. */
export function drawPinch(hand: Hand, frame: WayFrame, faces: readonly [readonly { u: number; v: number }[], readonly { u: number; v: number }[]], details: (side: number) => Vec[][]): void {
  clipped(hand, clipToFloor, () => {
    for (const [k, side] of [-1, 1].entries()) {
      const poly = bulge(frame, side, faces[k]!);
      hand.surface(polyPath(poly), 'rock');
      hand.edges(poly, true);
      hand.line(details(side), 'fine');
    }
  });
}
