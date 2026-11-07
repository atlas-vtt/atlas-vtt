import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { INTO_ROCK, neckFaces, pinchFrame } from './pinch';
import { dashes } from './shaftMouth';
import { clipped, clipToFloor, doorsOfWay } from './wayDoors';

/** How far past the door cell's middle the roof comes down, in cells: on the far side of the narrows, where the way dives. */
const ROOF_AT = 0.14;
/** How far the roof's line wavers either side of its run, in cells. */
const WAVER = 0.035;

/**
 * A sump (a way under water): its water is the floor's own, one body with the pool or lake it
 * leaves and one shore (`sumpMouths` floods its doorway with it), so the way draws none of its own,
 * which sat on the lake as a second shape with a shore of its own. It marks only where the roof
 * comes down into the water, as a survey draws what lies overhead: a short wavering dashed line
 * across the narrows from wall to wall, in the walls' ink.
 */
export function drawSumps(hand: Hand): void {
  const roofs: Vec[][] = [];
  for (const door of doorsOfWay(hand, 'sump')) {
    const frame = pinchFrame(door);
    const face = neckFaces(hand, frame);
    const from = -(face(-1, ROOF_AT) + INTO_ROCK);
    const to = face(1, ROOF_AT) + INTO_ROCK;
    const run = Array.from({ length: 9 }, (_, k) => frame.at(from + ((to - from) * k) / 8, ROOF_AT + Math.sin(k * 1.9 + door.x) * WAVER));
    roofs.push(...dashes(run, 0.09, 0.05, false));
  }
  if (roofs.length) clipped(hand, clipToFloor, () => hand.line(roofs, 'outline'));
}
