import type { DungeonTerrain } from '../../model';
import type { Vec } from '../geometry';
import { drawGlyph } from '../art/glyph';
import type { Hand } from '../art/hand';
import { polyPath } from '../art/paths';
import { facing } from '../../props/roomFrame';
import { STATUE_FIGURE, STATUE_PLINTH } from '../propStone';
import { bevelledBlock } from './cover';
import { boxOf, fragmentBox, INSET, lengthX } from './footprints';
import { facetedBlock } from './facets';
import { pieceRng, roomAxis } from './pieces';

/** Total cover nobody sees past: pillars, statues, wall fragments and obelisks, heavier than what is low. */

/** A dressed pillar, its top cut back in four lit and shaded faces. */
export function drawPillar(hand: Hand, piece: DungeonTerrain): void {
  facetedBlock(hand, boxOf(piece, INSET.pillar), 0.62, 'dressed');
}

/** An obelisk: its foot, then a point of four faces meeting at the top. */
export function drawObelisk(hand: Hand, piece: DungeonTerrain): void {
  const box = boxOf(piece, INSET.obelisk);
  facetedBlock(hand, box, 0.78, 'dressed');
  const s = Math.min(box.w, box.h) * 0.62;
  facetedBlock(hand, { cx: box.cx, cy: box.cy, w: s, h: s }, 0, 'stone', true);
}

/** A statue on its plinth, filling the plinth's cells, facing the way the piece faces. */
export function drawStatue(hand: Hand, piece: DungeonTerrain, water: string, cloth: string): void {
  const box = boxOf(piece, INSET.statue);
  const axis = roomAxis(hand.scene.env, piece);
  const rotation = facing(piece.facing ?? { x: -axis.x as -1 | 0 | 1, y: -axis.y as -1 | 0 | 1 });
  // The plinth keeps to the cells; the figure on it may face any way, a diagonal too.
  bevelledBlock(hand, box, 0.06);
  drawGlyph(hand, { x: box.cx, y: box.cy, rotation, scale: Math.min(box.w, box.h) / STATUE_PLINTH, fit: { along: STATUE_PLINTH, out: STATUE_PLINTH } }, STATUE_FIGURE, water, cloth);
}

/** A standing piece of wall: a slab of the wall's course, its ends broken, its joints irregular. */
export function drawWallFragment(hand: Hand, piece: DungeonTerrain): void {
  const box = fragmentBox(piece);
  const along = lengthX(piece);
  const rng = pieceRng(hand.scene.env, piece);
  const jag = (): number => (rng() - 0.5) * 0.09;
  // Broken ends: each end a few jagged points instead of a straight cut.
  const poly: Vec[] = along
    ? [
        { x: box.x + jag(), y: box.y },
        { x: box.x + box.w - 0.05 + jag(), y: box.y },
        { x: box.x + box.w + jag() * 0.5, y: box.cy + jag() },
        { x: box.x + box.w - 0.03 + jag(), y: box.y + box.h },
        { x: box.x + 0.06 + jag(), y: box.y + box.h },
        { x: box.x - 0.01 + jag() * 0.5, y: box.cy + jag() },
      ]
    : [
        { x: box.x, y: box.y + jag() },
        { x: box.cx + jag(), y: box.y - 0.01 + jag() * 0.5 },
        { x: box.x + box.w, y: box.y + 0.05 + jag() },
        { x: box.x + box.w, y: box.y + box.h - 0.04 + jag() },
        { x: box.cx + jag(), y: box.y + box.h + jag() * 0.5 },
        { x: box.x, y: box.y + box.h - 0.06 + jag() },
      ];
  hand.surface(polyPath(poly), 'dressed');
  const joints: Vec[][] = [];
  const len = along ? box.w : box.h;
  for (let s = 0.28 + rng() * 0.1; s < len - 0.12; s += 0.3 + rng() * 0.12) joints.push(along ? [{ x: box.x + s, y: box.y }, { x: box.x + s, y: box.y + box.h }] : [{ x: box.x, y: box.y + s }, { x: box.x + box.w, y: box.y + s }]);
  hand.line(joints, 'fine');
  hand.edges(poly, true);
  hand.line([[...poly, poly[0]!]], 'heavy');
}
