import type { Hand } from '../../art/hand';
import { valueNoise } from '../../art/noise';
import type { Vec } from '../../geometry';
import { smallDeepPools } from '../../stone/smallFloorFields';
import { pinchFrame } from './pinch';
import { dashes } from './shaftMouth';
import { doorsOfWay } from './wayDoors';

/** Half the pool's width across the way; the floor's outline trims it where the narrows are tighter. */
const HALF = 0.44;

/**
 * A sump (a way under water): the narrows as a walk has them, flooded. The pool fills the door cell
 * as the deep water behind it is drawn, through the hand's own water, and the roof that comes
 * down into it on the far side is dashed, as a survey draws what lies overhead.
 */
export function drawSumps(hand: Hand): void {
  const seed = hand.scene.env.dungeon.model.seed;
  for (const door of doorsOfWay(hand, 'sump')) {
    const { at } = pinchFrame(door);
    // Round towards the chamber, as water stands in a hollow; straight on into the passage, whose water it joins.
    const ring: Vec[] = [at(HALF, 0.55)];
    for (let k = 0; k <= 12; k++) {
      const t = (k / 12) * Math.PI;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      const wander = 1 + (valueNoise(door.x * 7 + cos * 2, door.y * 7 + sin * 2, seed + 31) - 0.5) * 0.12;
      ring.push(at(Math.sign(cos) * Math.abs(cos) ** 0.6 * HALF * wander, -(sin ** 0.6) * 0.46 * wander));
    }
    ring.push(at(-HALF, 0.55));
    // Depth from the shore as the pool's shape gives it, without tracing a field: it deepens from both walls and from the chamber's side.
    const depth = (x: number, y: number): number => {
      const u = (x - door.x - 0.5) * -door.dir.y + (y - door.y - 0.5) * door.dir.x;
      const v = (x - door.x - 0.5) * door.dir.x + (y - door.y - 0.5) * door.dir.y;
      return Math.max(0, Math.min(HALF - Math.abs(u), v + 0.46));
    };
    smallDeepPools(hand, [ring], depth);
    const roof = Array.from({ length: 9 }, (_, k) => {
      const u = -HALF + (2 * HALF * k) / 8;
      return at(u, 0.14 + Math.sin(k * 1.9 + door.x) * 0.035);
    });
    hand.line(dashes(roof, 0.09, 0.05, false), 'fine');
  }
}
