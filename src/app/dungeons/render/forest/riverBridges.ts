import type { DungeonRiverBridge } from '../../model';
import { bridgePoint, deckOf } from '../../forest/riverShape';
import { hash2 } from '../art/noise';
import { castShadow, type Hand } from '../art/hand';
import { polyPath, polysPath } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';

/**
 * The bridges that carry a Forest's roads over its rivers: planks laid across two log beams that
 * rest on the banks, as wide as the road, a rail of thin poles along each side, the deck's shadow
 * on the water below. Every direction draws them with
 * its own wood.
 */
export function drawRiverBridges(hand: Hand, bridges: readonly DungeonRiverBridge[]): void {
  for (const bridge of bridges) roadBridge(hand, bridge);
}

function roadBridge(hand: Hand, bridge: DungeonRiverBridge): void {
  const { at, length } = bridge;
  const point = (u: number, v: number): Vec => bridgePoint(bridge, u, v);
  const deck = deckOf(bridge);
  castShadow(hand, polyPath(deck), 0.6, pointsBounds(deck), 0.7);
  const seed = Math.floor(at.x * 7919 + at.y * 104729);
  const half = (bridge.breadth / 2) * 0.86;
  const planks: Vec[][] = [];
  let u = 0.04;
  for (let k = 0; u < length - 0.1; k++) {
    const w = 0.15 + 0.04 * hash2(k, 1, seed);
    const skew = (hash2(k, 2, seed) - 0.5) * 0.04;
    const shift = (hash2(k, 3, seed) - 0.5) * 0.06;
    // Here and there a plank is short of its neighbours, as an old deck's are.
    const short = hash2(k, 4, seed) < 0.15 ? 0.08 : 0;
    planks.push([point(u + skew, -half + shift + short), point(u + w + skew, -half + shift + short), point(u + w - skew, half + shift), point(u - skew, half + shift)]);
    u += w + 0.025;
  }
  hand.surface(polysPath(planks), 'wood');
  for (const plank of planks) hand.edges(plank, true);
  // Each side's rail of thin poles and the three posts that hold it, turned with the bridge.
  const rail = bridge.breadth / 2 - 0.04;
  for (const side of [-1, 1]) {
    hand.line([Array.from({ length: 9 }, (_, k) => point(0.12 + ((length - 0.24) * k) / 8, side * rail + (hash2(k, side, seed) - 0.5) * 0.02))], 'heavy');
    for (const along of [0.12, length / 2, length - 0.12]) {
      const post = [point(along - 0.06, side * rail - 0.06), point(along + 0.06, side * rail - 0.06), point(along + 0.06, side * rail + 0.06), point(along - 0.06, side * rail + 0.06)];
      hand.surface(polyPath(post), 'wood');
      hand.edges(post, true);
    }
  }
}
