import type { StairEnd } from '../../../floors/stairSpots';
import type { DungeonStair } from '../../../model';
import { hash2 } from '../../art/noise';
import type { Vec } from '../../geometry';
import { wayFrame, type WayFrame } from './narrows';
import { screeSlope, slopeArea } from './screeShape';
import { shaftMouth } from './shaftMouth';

/** One seed for both ends of a stairwell, so the aven's opening is the pitch's mouth. */
export function mouthSeed(stair: Pick<DungeonStair, 'link'>, modelSeed: number): number {
  return Math.floor(hash2(stair.link, 0, modelSeed) * 0x7fffffff);
}

/** A scree slope's seed, by where its frame lies. */
export function slopeSeed(frame: Pick<WayFrame, 'bounds'>, modelSeed: number): number {
  return Math.floor(hash2(frame.bounds.minX, frame.bounds.minY, modelSeed) * 0x7fffffff);
}

/** What a stairwell's cave way covers on the floor shown, as it is drawn: a shaft's mouth, or a scree slope. */
export function wayOutline(stair: DungeonStair, end: StairEnd, modelSeed: number): Vec[][] {
  const frame = wayFrame(stair, stair.down);
  if (stair.way === 'pitch') return [shaftMouth(frame, mouthSeed(stair, modelSeed)).rings[0]!];
  if (stair.way !== 'scree') return [];
  return [slopeArea(screeSlope(frame, slopeSeed(frame, modelSeed), end))];
}
