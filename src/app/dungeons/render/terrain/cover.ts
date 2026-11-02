import type { DungeonTerrain } from '../../model';
import type { Vec } from '../geometry';
import type { Hand } from '../art/hand';
import { polyPath, rectPoly } from '../art/paths';
import { lengthX, lowWallBox, type Box } from './footprints';
import { clearOfCaveWall, pieceRng } from './pieces';
import { stoneOutline } from './stones';

/** Half cover a party can shoot over: a heap of rubble, a low wall; and the stone block taller pieces stand on. */

/** A block cut from stone: its top and a bevel stepping down to its foot. */
export function bevelledBlock(hand: Hand, box: Box, bevel: number): void {
  const outer = rectPoly(box);
  const inner = rectPoly({ x: box.x + bevel, y: box.y + bevel, w: box.w - bevel * 2, h: box.h - bevel * 2 });
  hand.surface(polyPath(outer), 'dressed');
  hand.line([[...inner, inner[0]!], ...[0, 1, 2, 3].map(k => [outer[k]!, inner[k]!])], 'fine');
  hand.edges(outer, true);
}

export function circle(c: Vec, r: number, n = 24): Vec[] {
  return Array.from({ length: n }, (_, k) => ({ x: c.x + Math.cos((k / n) * Math.PI * 2) * r, y: c.y + Math.sin((k / n) * Math.PI * 2) * r }));
}

/** A heap of stones: larger in its middle, smaller at its foot, each lit and shading the next. */
export function drawRubbleHeap(hand: Hand, piece: DungeonTerrain): void {
  const rng = pieceRng(hand.scene.env, piece);
  const stones: { poly: Vec[]; c: Vec; r: number }[] = [];
  for (const cell of piece.cells) {
    const mid = { x: cell.x + 0.5, y: cell.y + 0.5 };
    for (let i = 0; i < 18; i++) {
      const c = { x: cell.x + 0.12 + rng() * 0.76, y: cell.y + 0.12 + rng() * 0.76 };
      const u = Math.min(1, Math.hypot(c.x - mid.x, c.y - mid.y) / 0.5);
      const r = (0.07 + 0.13 * (1 - u) ** 0.8) * (0.75 + rng() * 0.5);
      stones.push({ poly: stoneOutline(rng, c, r), c, r });
    }
  }
  stones.sort((p, q) => p.r - q.r);
  const shown = stones.filter((st) => clearOfCaveWall(hand.scene.env, st.c, st.r));
  if (hand.pile) {
    hand.pile(shown, () => 'fine');
    return;
  }
  for (const s of shown) {
    const path = polyPath(s.poly);
    hand.surface(path, 'rock');
    hand.solid(path, s.c, s.r, 1.3);
    hand.line([s.poly], 'fine', true);
  }
}

/** A low wall: a course of blocks narrower than a room's wall, its top lit. */
export function drawLowWall(hand: Hand, piece: DungeonTerrain): void {
  const box = lowWallBox(piece);
  const along = lengthX(piece);
  const outer = rectPoly(box);
  hand.surface(polyPath(outer), 'dressed');
  const joints: Vec[][] = [];
  const len = along ? box.w : box.h;
  for (let s = 0.32; s < len - 0.12; s += 0.34) joints.push(along ? [{ x: box.x + s, y: box.y }, { x: box.x + s, y: box.y + box.h }] : [{ x: box.x, y: box.y + s }, { x: box.x + box.w, y: box.y + s }]);
  hand.line(joints, 'fine');
  hand.edges(outer, true);
}
