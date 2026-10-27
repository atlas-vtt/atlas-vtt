import type { DungeonTerrain } from '../../model';
import type { Hand } from '../art/hand';
import { polyPath } from '../art/paths';
import { circle } from './cover';
import { boxOf, RING_STONE, RING_STONES, ringRadius } from './footprints';
import { pieceRng } from './pieces';
import { stoneOutline } from './stones';

/** Points of interest: a basin of water, a ring of standing stones. */

/** A basin: a stone rim round still water. */
export function drawPool(hand: Hand, piece: DungeonTerrain): void {
  const box = boxOf(piece, 0.1);
  const r = Math.min(box.w, box.h) / 2;
  const centre = { x: box.cx, y: box.cy };
  const rim = circle(centre, r, 40);
  const water = circle(centre, r - 0.1, 40);
  hand.surface(polyPath(rim), 'dressed');
  hand.solid(polyPath(rim), centre, r, 0.6);
  hand.water([water], (x, y) => Math.max(0, r - 0.1 - Math.hypot(x - centre.x, y - centre.y)), false);
  hand.edges(water, false);
  hand.edges(rim, true);
}

/** A ring of standing stones round an inlaid circle on the floor. */
export function drawPortalRing(hand: Hand, piece: DungeonTerrain): void {
  const box = boxOf(piece, 0.04);
  const centre = { x: box.cx, y: box.cy };
  const r = ringRadius(piece);
  const rng = pieceRng(hand.scene.env, piece);
  hand.line([[...circle(centre, r * 0.62, 48), circle(centre, r * 0.62, 48)[0]!], [...circle(centre, r * 0.55, 48), circle(centre, r * 0.55, 48)[0]!]], 'outline');
  for (let k = 0; k < RING_STONES; k++) {
    const a = (k / RING_STONES) * Math.PI * 2;
    const c = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
    const stone = stoneOutline(rng, c, RING_STONE);
    hand.surface(polyPath(stone), 'rock');
    hand.solid(polyPath(stone), c, RING_STONE, 1.3);
    hand.edges(stone, true);
  }
}
