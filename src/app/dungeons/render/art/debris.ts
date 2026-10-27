import type { DungeonCrack } from '../../model';
import { pointsBounds, traceSmoothClosed, type Vec } from '../geometry';
import { taperedOutline } from '../debris';
import { castShadow, type Hand } from './hand';
import { TO_LIGHT } from './light';
import { hash2 } from './noise';
import { clipFloors } from './outline';
import { polyPath, type PathFn } from './paths';
import { wallInkWidth } from '../wallInk';

/** Rubble and cracks of a crumbling floor, where the view shows props. */
export function drawDebris(hand: Hand): void {
  const { dungeon, view } = hand.scene.env;
  if (!view.props) return;
  const stones = dungeon.floor.walls === 'edges' ? dungeon.floor.rubble.filter(s => clearOfWalls(hand, s.points)) : dungeon.floor.rubble;
  if (stones.length) {
    const all: PathFn = path => stones.forEach(s => traceSmoothClosed(path, s.points));
    castShadow(hand, all, 0.05, pointsBounds(stones.flatMap(s => s.points)), 0.5);
    hand.surface(all, 'rock');
    for (const s of stones) {
      const c = s.points.reduce((a, p) => ({ x: a.x + p.x / s.points.length, y: a.y + p.y / s.points.length }), { x: 0, y: 0 });
      hand.solid(path => traceSmoothClosed(path, s.points), c, 0.06, 1.2);
    }
    hand.line(stones.map(s => [...s.points, s.points[0]!]), 'fine');
  }
  if (dungeon.floor.cracks.length) drawCracks(hand, dungeon.floor.cracks);
}

/**
 * Whether a stone lies wholly on the floor, clear of the wall's ink: a house's rubble is laid by its
 * cells, and its outer walls are thick enough to stand where a stone by the cell's edge would lie.
 */
function clearOfWalls(hand: Hand, points: readonly Vec[]): boolean {
  const { dungeon, style } = hand.scene.env;
  const ink = wallInkWidth(style);
  return points.every(p => dungeon.field.distance(p.x, p.y) < -ink);
}

/** A crack's line broken up finer, each piece bent a little off the straight, as stone splits. */
function splitLine(points: readonly Vec[], seed: number): Vec[] {
  let line = [...points];
  for (let level = 0; level < 3; level++) {
    const next: Vec[] = [line[0]!];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const bend = (hash2(Math.round(a.x * 97) + level, Math.round(a.y * 97) + i, seed) - 0.5) * len * 0.35;
      next.push({ x: (a.x + b.x) / 2 - ((b.y - a.y) / (len || 1)) * bend, y: (a.y + b.y) / 2 + ((b.x - a.x) / (len || 1)) * bend }, b);
    }
    line = next;
  }
  return line;
}

/** Cracks: a dark split narrowing to nothing, its far lip catching the light. */
function drawCracks(hand: Hand, cracks: readonly DungeonCrack[]): void {
  const { ctx, dungeon } = hand.scene.env;
  const outlines = cracks.map((crack, k) => taperedOutline({ points: splitLine(crack.points, dungeon.model.seed + k), width: crack.width * 0.38 })).filter(o => o.length >= 3);
  ctx.save();
  clipFloors(hand.scene);
  const lip = 0.006;
  ctx.beginPath();
  for (const o of outlines) polyPath(o.map(p => ({ x: p.x - TO_LIGHT.x * lip, y: p.y - TO_LIGHT.y * lip })))(ctx);
  ctx.fillStyle = hand.paint('raised').fill;
  ctx.fill();
  ctx.beginPath();
  for (const o of outlines) polyPath(o)(ctx);
  ctx.fillStyle = hand.paint('floor').ink;
  ctx.fill();
  ctx.restore();
}
