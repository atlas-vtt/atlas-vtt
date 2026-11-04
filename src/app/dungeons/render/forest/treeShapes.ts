import { hash2 } from '../art/noise';
import type { Vec } from '../geometry';
import { leafyMass, litPart, needledRing, type Clump } from '../grounds/crowns';

/**
 * The trees a forest's look grows (`ForestLook`): leafy crowns, needled conifer crowns (a whorl seen
 * from above, its branch tips points), and bare trees, dead or leafless, whose limbs fork out from
 * the trunk. Which a tree is follows from its place and the look's shares alone, so the drawing and
 * the scene agree, and a tree keeps its kind in every look with the same shares.
 */

export type TreeKind = 'leafy' | 'conifer' | 'bare';

/** The kind of the tree at `salt`, by the look's shares. */
export function treeKind(salt: number, look: { conifers: number; bare: number }): TreeKind {
  const roll = hash2(salt, 17, 3);
  return roll < look.bare ? 'bare' : roll < look.bare + look.conifers ? 'conifer' : 'leafy';
}

/** A crown of the kind (a bare tree has none: its clump is the leafy one it would have, for the woods' shadow and spacing). */
export function crownClump(at: Vec, r: number, salt: number, kind: TreeKind, lobes?: number): Clump {
  if (kind !== 'conifer') return leafyMass(at, r, 0, salt, lobes);
  // Fine branches, as many as a crown's lowest whorl has, so a small crown is needled and not toothed.
  const ring = needledRing(at, r, 14 + Math.round(r * 16), hash2(salt, 5, 3) * Math.PI * 2, salt);
  return { ring, shape: { points: ring }, centre: at, radius: r, height: 0, lit: litPart({ points: ring }, at, r), leaves: [] };
}

/** A bare tree's limbs: from the trunk out, each forking once or twice, as strokes (each a run of points) thinning outwards. */
export function bareLimbs(at: Vec, r: number, salt: number): Vec[][] {
  const limbs: Vec[][] = [];
  const count = 5 + Math.floor(hash2(salt, 1, 4) * 3);
  const turn = hash2(salt, 2, 4) * Math.PI * 2;
  for (let k = 0; k < count; k++) {
    const a = turn + (k / count) * Math.PI * 2 + (hash2(salt, k, 5) - 0.5) * 0.5;
    const reach = r * (0.75 + 0.25 * hash2(salt, k, 6));
    const bend = (hash2(salt, k, 7) - 0.5) * 0.5;
    const mid = { x: at.x + Math.cos(a) * reach * 0.55, y: at.y + Math.sin(a) * reach * 0.55 };
    const tip = { x: at.x + Math.cos(a + bend) * reach, y: at.y + Math.sin(a + bend) * reach };
    limbs.push([at, mid, tip]);
    // A fork from the middle, and on the larger limbs a twig from it.
    const fa = a + (hash2(salt, k, 8) < 0.5 ? -1 : 1) * (0.5 + 0.3 * hash2(salt, k, 9));
    const fork = { x: mid.x + Math.cos(fa) * reach * 0.42, y: mid.y + Math.sin(fa) * reach * 0.42 };
    limbs.push([mid, fork]);
    if (reach > r * 0.85) limbs.push([fork, { x: fork.x + Math.cos(fa + 0.6) * reach * 0.18, y: fork.y + Math.sin(fa + 0.6) * reach * 0.18 }]);
  }
  return limbs;
}
