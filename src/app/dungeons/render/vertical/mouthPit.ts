import { rngFrom } from '../../rng';
import type { Hand } from '../art/hand';
import { SHADOW_DIR, TO_LIGHT } from '../art/light';
import { centroid, polyPath, polysPath, type PathFn } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import { withAlpha } from '../palette';
import { shiftedBack } from '../cave/ways/shaftMouth';
import { stoneOf } from '../cave/ways/wayColours';
import { band, fillWith, litLip, lookOf, ticks } from './marks';
import { lipRing, pitRim } from './pit';
import { drawRubble, insideOf, rubbleStone } from './rubble';
import { normalsOf, offsetRun } from './runs';

/**
 * A pitch's mouth on the floor above (`shaftMouth`'s rings): the pit of `pit.ts` drawn from its
 * rings instead of a sampled depth, so a stairwell's shaft costs no more than a prop. The floor
 * below shows inside the second ring, which lies drawn back towards the light: the far wall's face
 * between them shows wide and lit, the near one narrow, and the rim's shadow falls across it.
 */

export interface MouthPitOptions {
  feet: number;
  seed: number;
  keepClear?: Vec;
  rigged?: () => void;
}

/** Darkens `path` by `level` (0..1) in the hand's own way: a fill in ink and tone, crayon pressed in, the engraving's hatching. */
function shade(hand: Hand, path: PathFn, points: readonly Vec[], level: number): void {
  const c = stoneOf(hand);
  if (c) fillWith(hand, path, withAlpha(c.dark ? '#000000' : c.shadow, level * 0.75));
  else if (hand.wax) hand.wax(path, Math.min(1, level * 1.3), 2);
  else hand.tone(() => level, pointsBounds(points), path, 'shade');
}

/** The ring and the part of it the rim's shadow (along `dir`, `reach` cells) covers, inside it. */
function crescent(hand: Hand, ring: readonly Vec[], dir: Vec, reach: number, draw: (path: PathFn) => void): void {
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  polyPath(ring)(ctx);
  ctx.clip();
  draw(polysPath([ring, shiftedBack(ring, dir, reach)]));
  ctx.restore();
}

/** Crayon's face and shadow: broad strokes round the inside of the rim, and over them along the near rim, as wide as the shadow. */
function crayonFace(hand: Hand, rim: readonly Vec[], b: number): void {
  const inside = insideOf(rim);
  const normals = normalsOf(rim, true);
  const ring = offsetRun(rim, normals, () => 0.09, inside);
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  polyPath(rim)(ctx);
  ctx.clip();
  hand.waxStroke!([[...ring, ring[0]!]], 0.17, 0.42);
  const near: Vec[][] = [];
  let run: Vec[] = [];
  rim.forEach((_, i) => {
    const n = { x: normals[i]!.x * inside, y: normals[i]!.y * inside };
    if (n.x * SHADOW_DIR.x + n.y * SHADOW_DIR.y > 0.2) run.push(offsetRun(rim, normals, () => (b + 0.06) / 2, inside)[i]!);
    else if (run.length) {
      near.push(run);
      run = [];
    }
  });
  if (run.length) near.push(run);
  hand.waxStroke!(near.filter(r => r.length > 1), b + 0.06, 0.4);
  ctx.restore();
}

export function drawMouthPit(hand: Hand, rings: readonly Vec[][], options: MouthPitOptions): void {
  const rim = rings[0]!;
  const floor = rings[1]!;
  const b = band(options.feet);
  const face = polysPath([rim, floor.slice().reverse()]);
  const look = lookOf(hand);
  // Crayon colours the whole mouth as floor once and presses the face in; the others fill rock, then the floor below.
  if (look === 'crayon') hand.fill(polyPath(rim), 'floor');
  else {
    hand.fill(polyPath(rim), 'rock');
    hand.fill(polyPath(floor), 'floor');
  }
  // The face between rim and floor, the floor below a little dimmed in tone (paper in the engraving), then the rim's shadow across both.
  if (look === 'crayon' && hand.waxStroke) crayonFace(hand, rim, b);
  else {
    shade(hand, face, rim, 0.42);
    if (look === 'ink') shade(hand, polyPath(floor), floor, 0.22);
    crescent(hand, rim, SHADOW_DIR, b + 0.06, path => shade(hand, path, rim, 0.45));
  }
  const c = stoneOf(hand);
  if (c) crescent(hand, rim, TO_LIGHT, 0.07, path => fillWith(hand, path, withAlpha(c.light, c.dark ? 0.2 : 0.4)));
  // What came down onto the floor below, in its lit middle.
  const rng = rngFrom(options.seed);
  const mid = centroid(floor);
  drawRubble(hand, Array.from({ length: 4 }, () => rubbleStone(rng, { x: mid.x + (rng() - 0.5) * 0.35, y: mid.y + (rng() - 0.5) * 0.35 }, 0.025 + 0.03 * rng())));
  options.rigged?.();
  hand.line(lipRing(rim, options.seed), 'fine');
  if (lookOf(hand) !== 'ink') hand.line([floor], 'fine', true);
  const low = insideOf(rim);
  ticks(hand, rim, low, Math.min(0.11, 0.05 + b * 0.12), { closed: true, seed: options.seed + 11, ...(options.keepClear && { keepClear: options.keepClear }) });
  pitRim(hand, rim);
  litLip(hand, rim, low, true, 0.012);
}
