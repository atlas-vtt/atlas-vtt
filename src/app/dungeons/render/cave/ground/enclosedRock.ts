import type { ArtScene } from '../../art/artScene';
import { grownRings, unionRings } from '../../clipShapes';
import { pointsBounds, signedArea2, type Vec } from '../../geometry';
import type { Pocket } from '../../pockets';

/**
 * The rock the floors close in on, grown out to meet the floors' edges: the pockets reach only a
 * little under the band (`pockets.ts`), so a surround that lays its rock short of the band's reach
 * would leave paper between the two. Each ring is turned the way the floors' outlines run first,
 * since growing a ring turned the other way shrinks it.
 */
export function enclosedRock(scene: ArtScene, pockets: readonly Pocket[], grow: number): Pocket[] {
  if (!pockets.length) return [];
  const outline = Math.sign(signedArea2(largest(scene.floorRings)));
  const turned = pockets.map(({ ring }) => (Math.sign(signedArea2(ring)) === outline ? ring : [...ring].reverse()));
  return unionRings(grownRings(turned, grow))
    .filter(ring => Math.sign(signedArea2(ring)) === outline)
    .map(ring => ({ ring, bounds: pointsBounds(ring) }));
}

function largest(rings: readonly Vec[][]): Vec[] {
  let best: Vec[] = [];
  let area = 0;
  for (const ring of rings) {
    const a = Math.abs(signedArea2(ring));
    if (a > area) {
      area = a;
      best = ring;
    }
  }
  return best;
}
