import type { Vec } from '../geometry';
import { pointsBounds } from '../geometry';
import type { Hand } from '../art/hand';
import { TO_LIGHT } from '../art/light';
import { valueNoise } from '../art/noise';
import { grown, polysPath, smoothstep, type Field } from '../art/paths';
import { depthField } from '../art/pools';
import { insetRuns } from '../shore';

/**
 * A drop into the floor: its lip, the face below it (lit where it looks towards the light, dark
 * where it looks away and lies in the lip's shadow), ledges stepping down the face, then what lies
 * at the bottom: darkness for a void, a dim floor for a pit or the floor below.
 */
export type DropBottom = 'void' | 'floor' | 'pit';

/** How wide the face of a drop shows, in cells, by what lies below. */
export const FACE: Record<DropBottom, number> = { void: 0.3, floor: 0.3, pit: 0.2 };

/** Distance into the drop from its lip, and the way into it, from its outlines. */
export function dropDepth(hand: Hand, rings: readonly Vec[][]): { depth: Field; inward: (x: number, y: number) => Vec } {
  const depth = depthField(hand.scene, polysPath(rings), rings.flat());
  const e = 1 / hand.scene.grid.res;
  const inward = (x: number, y: number): Vec => {
    const gx = depth(x + e, y) - depth(x - e, y);
    const gy = depth(x, y + e) - depth(x, y - e);
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  };
  return { depth, inward };
}

/** How dark the drop is at a point, 0..1: its face by the way it looks, then its bottom. */
export function dropTone(depth: Field, inward: (x: number, y: number) => Vec, bottom: DropBottom): Field {
  const face = FACE[bottom];
  return (x, y) => {
    const d = depth(x, y);
    if (d <= 0) return 0;
    const n = inward(x, y);
    // The face under the far lip looks back towards the light; the one under the near lip lies in its shadow.
    const lit = n.x * TO_LIGHT.x + n.y * TO_LIGHT.y;
    const faceTone = 0.36 - 0.3 * lit + 0.42 * (d / face) ** 1.4 + 0.06 * (valueNoise(x * 7, y * 7, 3) - 0.5);
    if (d < face) return Math.max(0, Math.min(1, faceTone));
    if (bottom === 'pit') return 0.5 - 0.1 * lit;
    if (bottom === 'floor') return 0.62;
    return Math.min(1, 0.86 + 0.14 * smoothstep(face, face + 0.6, d));
  };
}

/** A drop drawn whole: rock face, depth, ledges, lip. `built` drops (a gallery's well) have dressed faces and no ledges. */
export function drawDrop(hand: Hand, rings: Vec[][], bottom: DropBottom, built = false): void {
  const path = polysPath(rings);
  const bounds = grown(pointsBounds(rings.flat()), 0.1);
  const { depth, inward } = dropDepth(hand, rings);
  hand.surface(path, built ? 'dressed' : 'rock');
  if (bottom !== 'void') {
    // The bottom: floor far below, seen through the dark.
    hand.surface(polysPath(rings.flatMap(r => insetRuns(r, FACE[bottom]).filter(run => run.length > 2))), 'floor');
  }
  hand.tone(dropTone(depth, inward, bottom), bounds, path, 'depth');
  if (!built) hand.line(ledges(rings, bottom), 'fine');
  for (const ring of rings) hand.edges(ring, false);
}

/** Lines following the lip down the face, broken, as rock steps away below it. */
function ledges(rings: readonly Vec[][], bottom: DropBottom): Vec[][] {
  const out: Vec[][] = [];
  for (const ring of rings) {
    for (const inset of bottom === 'pit' ? [0.08] : [0.09, 0.19]) {
      for (const run of insetRuns(ring, inset)) {
        let piece: Vec[] = [];
        run.forEach((p, i) => {
          if (valueNoise(p.x * 3.3 + inset * 9, p.y * 3.3, 17) > 0.58) {
            if (piece.length > 2) out.push(piece);
            piece = [];
          } else piece.push(p);
          if (i === run.length - 1 && piece.length > 2) out.push(piece);
        });
      }
    }
  }
  return out;
}
