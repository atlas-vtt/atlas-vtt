import type { DungeonColumn } from '../../model';
import type { Vec } from '../geometry';
import type { Hand } from './hand';
import { polyPath } from './paths';

/**
 * Columns: their tops of dressed stone lit from the top left, a worn ring where the capital steps
 * in, a crisp rim. A shattered column is its stump: a broken ring of its drum.
 */

function outline(c: DungeonColumn, grow = 0): Vec[] {
  const r = c.radius + grow;
  if (c.square) return [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }];
  return Array.from({ length: 40 }, (_, k) => ({ x: c.x + Math.cos((k / 40) * Math.PI * 2) * r, y: c.y + Math.sin((k / 40) * Math.PI * 2) * r }));
}

export function drawColumns(hand: Hand): void {
  const { dungeon } = hand.scene.env;
  for (const c of dungeon.floor.columns) {
    if (dungeon.field.distance(c.x, c.y) >= 0) continue;
    const ring = outline(c);
    if (c.shattered) {
      const stump = outline(c, -c.radius * 0.2);
      hand.surface(polyPath(stump), 'stone');
      hand.solid(polyPath(stump), c, c.radius, 1);
      hand.line([stump.filter((_, k) => k % 10 < 6)], 'fine');
      continue;
    }
    hand.surface(polyPath(ring), 'dressed');
    hand.solid(polyPath(ring), c, c.radius, 1.2);
    const capital = outline(c, -c.radius * 0.26);
    hand.line([[...capital, capital[0]!]], 'fine');
    hand.edges(ring, true);
  }
}
