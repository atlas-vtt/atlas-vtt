import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { drawBlocks, type Block } from '../../terrain/caveStones';
import { stoneOutline } from '../../terrain/stones';
import { pinchFrame } from './pinch';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/**
 * A breakdown (a way through fallen blocks): the narrows as a walk has them, choked by three to
 * five blocks drawn as the boulder choke's are. They lie against one wall and then the other, so
 * a way weaves between them and the door cell never reads as closed.
 */
export function drawBreakdowns(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'breakdown')) {
    const rng = doorRng(hand, door, 'breakdown');
    const { at } = pinchFrame(door);
    const count = 3 + Math.floor(rng() * 3);
    let side = rng() < 0.5 ? -1 : 1;
    const blocks: Block[] = [];
    for (let k = 0; k < count; k++) {
      const v = -0.34 + (0.68 * k) / (count - 1) + (rng() - 0.5) * 0.04;
      const radius = (count > 3 ? 0.16 : 0.19) + rng() * 0.03;
      // Each block takes its wall's half of the way and leaves the other half free beside it.
      const centre: Vec = at(side * (0.21 + rng() * 0.03), v);
      blocks.push({ poly: stoneOutline(rng, centre, radius), centre, radius });
      side = -side;
    }
    clipped(hand, clipToFloor, () => drawBlocks(hand, blocks));
  }
}
