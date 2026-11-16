import { stackOf, stairEnd } from '../../../floors/floorStack';
import type { StairEnd } from '../../../floors/stairSpots';
import type { DungeonStair } from '../../../model';
import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import type { RenderEnv } from '../../renderEnv';
import { band } from '../../vertical/marks';
import { drawCoil, drawOverhead } from '../../vertical/overhead';
import { drawMouthPit } from '../../vertical/mouthPit';
import { drawAnchor, drawRope } from '../../vertical/rope';
import { wayFrame, type WayFrame } from './narrows';
import { approachLength, shaftMouth, type ShaftMouth } from './shaftMouth';
import { mouthSeed } from './wayOutline';

/**
 * A pitch between floors: on the floor above, a shaft in the floor drawn as every pit is, ten feet
 * a floor deep, with a rope tied to a ring on a boulder on the approach going over the near lip
 * into the shadow below, where it is lost; on the floor below, the same mouth overhead, dashed, and
 * the rope's coil at its foot. Both floors take one mouth, so the openings agree.
 */

/** How deep a stairwell drops, in feet: ten a floor. */
function feetOf(env: RenderEnv, stair: DungeonStair): number {
  return 10 * Math.max(1, Math.abs(stair.to - env.dungeon.index));
}

function pitch(hand: Hand, frame: WayFrame, mouth: ShaftMouth, feet: number, seed: number): void {
  const { at, along } = frame;
  const { near } = mouth;
  // The ring is bolted to rock on the approach, a fifth to a half of a cell back from the edge.
  const back = Math.max(0.2, Math.min(0.45, approachLength(along) * 0.6));
  const anchor = at(-0.14, near - back);
  const lip = at(0.02, near + 0.02);
  drawMouthPit(hand, mouth.rings, {
    feet,
    seed,
    keepClear: lip,
    rigged: () => drawRope(hand, [anchor, at(-0.05, near - back * 0.45), lip, at(0.04, near + 0.02 + band(feet) * 0.85)]),
  });
  drawAnchor(hand, anchor, seed + 1);
}

/** An opening overhead seen from the floor below it: dashed, with a second ring where the way narrows as it rises. */
export function drawAvenOpening(hand: Hand, rim: readonly Vec[], feet: number, seed: number, under: 'rubble' | 'drips'): void {
  drawOverhead(hand, rim, { seed, narrows: feet >= 30, under });
}

/** The rim of each pitch's mouth on the floor shown, where it goes down from: the grid stops at it. */
export function pitchRims(env: RenderEnv): Vec[][] {
  const { dungeon } = env;
  return dungeon.floor.stairs
    .filter(stair => stair.way === 'pitch' && stairEnd(stackOf(dungeon.model), dungeon.index, stair.to) === 'upper')
    .map(stair => shaftMouth(wayFrame(stair, stair.down), mouthSeed(stair, env.dungeon.model.seed)).rings[0]!);
}

function drawEnds(hand: Hand, end: StairEnd): void {
  const { env } = hand.scene;
  const { dungeon } = env;
  for (const stair of dungeon.floor.stairs) {
    if (stair.way !== 'pitch' || stairEnd(stackOf(dungeon.model), dungeon.index, stair.to) !== end) continue;
    const frame = wayFrame(stair, stair.down);
    const seed = mouthSeed(stair, env.dungeon.model.seed);
    const mouth = shaftMouth(frame, seed);
    const feet = feetOf(env, stair);
    if (end === 'upper') pitch(hand, frame, mouth, feet, seed);
    else {
      drawAvenOpening(hand, mouth.rings[0]!, feet, seed + 3, 'drips');
      // The rope's coil lies on the floor where it hangs down, under the near lip it went over above.
      drawCoil(hand, frame.at(0.05, mouth.near + 0.3), seed + 5);
    }
  }
}

export function drawPitches(hand: Hand): void { drawEnds(hand, 'upper'); }
export function drawAvens(hand: Hand): void { drawEnds(hand, 'lower'); }
