import { stackOf, stairEnd } from '../../../floors/floorStack';
import type { StairEnd } from '../../../floors/stairSpots';
import type { CellDir } from '../../../model';
import type { Hand } from '../../art/hand';
import { hash2 } from '../../art/noise';
import { polyPath, polysPath } from '../../art/paths';
import { doorFrame, wayFrame, type WayFrame } from './narrows';
import { screeShape } from './screeShape';
import { dashes } from './shaftMouth';
import { drawFaceTicks, layDepth, layFaces } from './slopeShading';
import { stoneOf } from './wayColours';
import { withAlpha } from '../../palette';

/**
 * A scree slope as a way down: a ramp of loose stone cut into the rock between two faces that widen
 * as the floor drops away beside it, darkening with depth until it runs in under a brow of rock into
 * the dark (`screeShape`). From the floor below the same slope comes out of the dark under the
 * ceiling, its edge there dashed as the aven's rim is, and spills down to the floor. Its stones lie
 * in rows across the slope, small high up, cobbles and boulders low down.
 */
function slope(hand: Hand, frame: WayFrame, end?: StairEnd): void {
  // A cave's wall may wander into the stairwell's cells: the cutting is drawn on the floor only, never over the wall's ink.
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  polysPath(hand.scene.floorRings)(ctx);
  ctx.clip();
  drawSlope(hand, frame, end);
  ctx.restore();
}

function drawSlope(hand: Hand, frame: WayFrame, end?: StairEnd): void {
  const seed = Math.floor(hash2(frame.bounds.minX, frame.bounds.minY, hand.scene.env.dungeon.model.seed) * 0x7fffffff);
  const shape = screeShape(frame, seed, end);
  const stone = stoneOf(hand) !== null;
  // The stones lie on the ramp first, so the slope's depth darkens them with it.
  if (hand.pile) hand.pile(shape.stones, () => 'fine');
  else {
    const polys = shape.stones.map(s => s.poly);
    hand.fill(polysPath(polys), 'rock');
    const boulders = shape.stones.slice().sort((a, b) => b.r - a.r).slice(0, 2);
    for (const s of boulders) hand.solid(polyPath(s.poly), s.c, s.r, frame.progress(s.c.x, s.c.y));
    hand.line(polys, 'fine', true);
  }
  layFaces(hand, frame, shape, end);
  layDepth(hand, frame, shape, end);
  drawFaceTicks(hand, frame, shape, end, stone ? 0.55 : 1, seed);
  hand.line(shape.rims, 'outline');
  if (shape.head.length) hand.line(shape.head, 'fine');
  if (!shape.brow) return;
  if (end === 'lower') {
    // The ceiling's edge overhead, which the slope comes down from under: dashed as the aven's rim,
    // each dash on a pale lip so it shows over the dark.
    const marks = dashes(shape.brow, 0.12, 0.06, false);
    const { ctx } = hand.scene.env;
    const c = stoneOf(hand);
    ctx.save();
    ctx.beginPath();
    for (const run of marks) {
      ctx.moveTo(run[0]!.x, run[0]!.y);
      for (const p of run.slice(1)) ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = c ? withAlpha(c.light, c.dark ? 0.5 : 0.7) : hand.paint('rock').fill;
    ctx.lineWidth = hand.weight('outline') * 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    hand.line(marks, 'outline');
    return;
  }
  // The brow the ramp runs in under: an arch of the cave's own rock, standing over the dark.
  hand.fill(polyPath(shape.browRock!), 'rock');
  hand.line(shape.browCracks, 'fine');
  hand.edges(shape.browRock!, true);
}

export function drawScree(hand: Hand): void {
  const { dungeon } = hand.scene.env;
  for (const door of dungeon.doors) {
    if (door.kind !== 'steps') continue;
    const down = door.descends ? door.dir : { x: -door.dir.x, y: -door.dir.y } as CellDir;
    slope(hand, doorFrame(door, down));
  }
  for (const stair of dungeon.floor.stairs) {
    if (stair.way === 'scree') slope(hand, wayFrame(stair, stair.down), stairEnd(stackOf(dungeon.model), dungeon.index, stair.to));
  }
}
