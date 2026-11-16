/**
 * What stands free on the lawn: trees, seen from above as their crowns of leaves (`crowns.ts`); the
 * fountain the drive turns round, an octagonal basin of water on its island of grass with a
 * pedestal bowl in its middle; and the porch's two columns, each a square plinth under its capital.
 */

import { cellsBox } from '../../geometry';
import type { GroundsPiece } from '../../model';
import type { Hand } from '../art/hand';
import { polyPath, rectPoly } from '../art/paths';
import type { Vec } from '../geometry';
import { circle } from '../terrain/cover';
import type { Crown } from './crowns';
import type { GroundsPaint } from './paint';

/** Seen from above, the crown hides the trunk; its limbs show only through the gaps in the leaves. */
export function drawTree(paint: GroundsPaint, crown: Crown): void {
  paint.crown(crown);
}

/** The fountain a drive turns round: on its island of grass, a basin of eight sides and a bowl on a pedestal in its middle. */
export function drawFountain(hand: Hand, paint: GroundsPaint, fountain: GroundsPiece): void {
  const c = fountain.at;
  if (!c) return;
  // The basin grows with its island: a drive four cells wide turns round an island of four.
  const s = 0.55 + 0.45 * (cellsBox(fountain.cells).w / 2);
  const octagon = (r: number): Vec[] => Array.from({ length: 8 }, (_, k) => ({ x: c.x + Math.cos(((k + 0.5) / 8) * Math.PI * 2) * r, y: c.y + Math.sin(((k + 0.5) / 8) * Math.PI * 2) * r }));
  const rim = octagon(0.9 * s);
  const water = octagon(0.76 * s);
  hand.surface(polyPath(rim), 'dressed');
  hand.line(rim.map((p, k) => [p, water[k]!]), 'fine');
  paint.pool(polyPath(water), c, 0.76 * s);
  hand.edges(water, false);
  hand.edges(rim, true);
  const pedestal = circle(c, 0.3 * s, 32);
  const bowl = circle(c, 0.22 * s, 32);
  hand.surface(polyPath(pedestal), 'dressed');
  hand.solid(polyPath(pedestal), c, 0.3 * s, 0.8);
  hand.edges(pedestal, true);
  paint.pool(polyPath(bowl), c, 0.22 * s);
  hand.edges(bowl, false);
  const jet = circle(c, 0.045 * s, 12);
  hand.surface(polyPath(jet), 'metal');
  hand.edges(jet, true);
}

/** A porch's column seen from above: its square plinth, and over it the capital, a square abacus round the round of the shaft. */
export function drawColumn(hand: Hand, at: Vec): void {
  const plinth = rectPoly({ x: at.x - 0.15, y: at.y - 0.15, w: 0.3, h: 0.3 });
  const abacus = rectPoly({ x: at.x - 0.115, y: at.y - 0.115, w: 0.23, h: 0.23 });
  hand.surface(polyPath(plinth), 'dressed');
  hand.edges(plinth, true);
  hand.surface(polyPath(abacus), 'stone');
  hand.solid(polyPath(abacus), at, 0.12, 0.6);
  hand.edges(abacus, true);
  hand.line([circle(at, 0.085, 24)], 'fine', true);
}
