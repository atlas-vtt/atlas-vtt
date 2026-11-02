import type { Hand } from '../../art/hand';
import { polyPath } from '../../art/paths';
import { doorFrame } from './narrows';

/** A crawl stays rock: quiet fracture faces between its mouths, with both wall lines untouched. */
export function drawCrawls(hand: Hand): void {
  for (const door of hand.scene.env.dungeon.doors) {
    if (door.kind !== 'secret') continue;
    const { at } = doorFrame(door);
    const slab = [at(-0.42, -0.36), at(-0.13, -0.43), at(0.34, -0.38), at(0.43, -0.13), at(0.36, 0.39), at(-0.12, 0.43), at(-0.40, 0.23)];
    hand.surface(polyPath(slab), 'rock');
    hand.line([[at(-0.34, -0.29), at(-0.08, -0.14), at(0.06, 0.12), at(0.30, 0.25)], [at(-0.08, -0.14), at(0.24, -0.24)]], 'fine');
    // The existing GM secret-door feature belongs to the scene, not to the baked picture.
  }
}
