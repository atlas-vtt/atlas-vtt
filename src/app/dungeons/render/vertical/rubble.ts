import type { Hand, PileStone } from '../art/hand';
import { SHADOW_DIR } from '../art/light';
import { polyPath, polysPath } from '../art/paths';
import { signedArea2, type Vec } from '../geometry';
import { withAlpha } from '../palette';
import { stoneOutline } from '../terrain/stones';
import { lookOf } from './marks';

/**
 * Loose rock at the foot of a drop: angular pieces, crowded in the shadow and next to walls, the
 * largest with a little dark under it where it sits on the floor. Never on the high side.
 */

/** The smallest stone whose facets show, in cells across its middle. */
const MODELLED = 0.065;

/** A stone of rubble at `c`, `r` cells across its middle. */
export function rubbleStone(rng: () => number, c: Vec, r: number): PileStone {
  return { poly: stoneOutline(rng, c, r), c, r };
}

/** Which side of a closed ring its inside lies on, as `low` of a run (+1 the left of its way round). */
export function insideOf(ring: readonly Vec[]): number {
  return signedArea2(ring) > 0 ? -1 : 1;
}

/** Draws rubble back to front: the hand's own pile where it models stones, else filled and outlined; the largest sit in a little shade of their own. */
export function drawRubble(hand: Hand, stones: readonly PileStone[]): void {
  if (!stones.length) return;
  const sorted = stones.slice().sort((a, b) => a.c.y - b.c.y);
  if (lookOf(hand) === 'ink' && hand.scene.env.view.shadow) {
    // Contact shade under the larger pieces only: the grit lies flat.
    const big = sorted.filter(s => s.r >= 0.05).map(s => s.poly.map(p => ({ x: p.x + (p.x - s.c.x) * 0.15 + SHADOW_DIR.x * s.r * 0.35, y: p.y + (p.y - s.c.y) * 0.15 + SHADOW_DIR.y * s.r * 0.35 })));
    if (big.length) {
      const { ctx } = hand.scene.env;
      ctx.save();
      ctx.beginPath();
      polysPath(big)(ctx);
      ctx.fillStyle = withAlpha('#000000', 0.22);
      ctx.fill();
      ctx.restore();
    }
  }
  // Only a stone large enough to show its facets is modelled; grit is filled and outlined, which looks the same and costs far less.
  const modelled = sorted.filter(s => s.r >= MODELLED);
  const plain = sorted.filter(s => s.r < MODELLED);
  if (plain.length) {
    hand.fill(polysPath(plain.map(s => s.poly)), 'rock');
    hand.line(plain.map(s => s.poly), 'fine', true);
  }
  if (!modelled.length) return;
  if (hand.pile) {
    hand.pile(modelled, s => (s.r >= 0.06 ? 'outline' : 'fine'));
    return;
  }
  hand.fill(polysPath(modelled.map(s => s.poly)), 'rock');
  for (const s of modelled.filter(s => s.r >= 0.07)) hand.solid(polyPath(s.poly), s.c, s.r, 0.8);
  hand.line(modelled.map(s => s.poly), 'fine', true);
}
