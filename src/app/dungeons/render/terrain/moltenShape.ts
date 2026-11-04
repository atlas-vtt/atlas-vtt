import type { DungeonTerrain } from '../../model';
import { chaikin } from '../../water/smooth';
import type { Vec } from '../geometry';
import { raggedCellRings } from './crack';
import type { RaggedShape } from './scatterPatch';

/**
 * The outline of lava or acid on a cave's floor: one smoothed, noised shore round each piece of it,
 * never the steps of its cells, swelling and pinching along a flow as molten rock and acid lie in
 * rock, and held near its cells as a chasm's lip is, since the scene's walls stand on the cells.
 * The map draws it and the scene's moving surface and glow lie on it (`scene/toLiquids.ts`), so
 * both take it from here.
 */

/** Rounder than a crack, its swell longer and fuller: a liquid's shore is smooth, its width wavering, never chipped. */
const MOLTEN: RaggedShape = { sigma: 2.2, waves: 1.3, swell: 0.24, rag: 0.04, outwards: 0.02 };

/** The shore of a piece of lava or acid on a cave's floor, in cells. */
export function moltenRings(seed: number, piece: DungeonTerrain): Vec[][] {
  return raggedCellRings(piece.cells, seed + piece.id * 23 + 977, MOLTEN, (ring) => chaikin(ring, 1));
}

/** Whether a piece is lava or acid, standing or running. */
export function isMolten(piece: DungeonTerrain): boolean {
  return piece.traits.hazard === 'lava' || piece.traits.hazard === 'acid';
}

/**
 * A shore moved `by` cells out from what it holds (in, where negative), along each point's normal:
 * a rim outside it. Its rings run as `cellRings` makes them, what they hold on the right of the way
 * round, so out is on the left, for an island's shore as for the outer one.
 */
export function outsetRing(ring: readonly Vec[], by: number): Vec[] {
  const n = ring.length;
  return ring.map((p, i) => {
    const prev = ring[(i - 1 + n) % n]!;
    const next = ring[(i + 1) % n]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty) || 1;
    return { x: p.x + (ty / length) * by, y: p.y - (tx / length) * by };
  });
}
