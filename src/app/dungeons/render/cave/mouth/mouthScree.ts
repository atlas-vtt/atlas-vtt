/**
 * Where a cave's walls end at its mouth the rock does not stop: it breaks up into scree that runs
 * on beside the way out, the stones smaller and fewer the farther out, until only grit is left on
 * the paper. Drawn once through the painter's hand, as the scree of a slope is.
 */

import { rngFrom } from '../../../rng';
import { castShadow, type Hand } from '../../art/hand';
import { polyPath, polysPath, type PathFn } from '../../art/paths';
import { pointsBounds, type Vec } from '../../geometry';
import { stoneOutline } from '../../terrain/stones';
import { groundDistance, wayCentre, wayHalf, wayPoint, wayStrength, type WayOut } from './wayOut';

/** Stones beside each side of a mouth, and how far out along the way the scree runs, in cells. */
const SCREE = { stones: 18, reach: 2.1, from: -0.25 };
/** Clear of the floor's edge and its wall ink, as a share of a stone's radius plus cells. */
const FLOOR_CLEAR = 0.06;

interface Stone {
  poly: Vec[];
  c: Vec;
  r: number;
}

/** The scree on both sides of one way out. */
function screeOf(way: WayOut, distance: (p: Vec) => number): Stone[] {
  const rng = rngFrom((way.seed ^ 0x51ce) >>> 0);
  const stones: Stone[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < SCREE.stones; k++) {
      // Most stones lie at the wall's end; fewer, smaller ones farther out.
      const t = ((k + rng() * 0.9) / SCREE.stones) ** 1.35;
      const u = SCREE.from + t * (SCREE.reach - SCREE.from);
      const off = 0.02 + rng() * (0.08 + 0.42 * (1 - t));
      const v = wayCentre(way, u) + side * (wayHalf(way, Math.max(0, u), side) + off);
      const r = (0.115 - 0.08 * t) * (0.6 + rng() * 0.6);
      const c = wayPoint(way, u, v);
      if (distance(c) < r + FLOOR_CLEAR) continue;
      if (wayStrength(way, c, distance) > 0.45) continue;
      if (stones.some((s) => Math.hypot(s.c.x - c.x, s.c.y - c.y) < (s.r + r) * 0.9)) continue;
      stones.push({ poly: stoneOutline(rng, c, r), c, r });
    }
  }
  return stones;
}

export function drawMouthScree(hand: Hand, ways: readonly WayOut[]): void {
  const distance = groundDistance(hand.scene.env.dungeon.field);
  const stones = ways.flatMap((way) => screeOf(way, distance));
  if (!stones.length) return;
  const all: PathFn = polysPath(stones.map((s) => s.poly));
  castShadow(hand, all, 0.05, pointsBounds(stones.flatMap((s) => s.poly)), 0.55);
  if (hand.pile) {
    hand.pile(stones, (s) => (s.r > 0.07 ? 'outline' : 'fine'));
    return;
  }
  hand.surface(all, 'rock');
  for (const s of stones) if (s.r > 0.07) hand.solid(polyPath(s.poly), s.c, s.r, 1.1);
  hand.line(stones.filter((s) => s.r <= 0.07).map((s) => s.poly), 'fine', true);
  hand.line(stones.filter((s) => s.r > 0.07).map((s) => s.poly), 'outline', true);
}
