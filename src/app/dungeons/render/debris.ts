import type { CellPoint, DungeonCrack } from '../model';
import type { Vec } from './geometry';

/** A polyline turned into a polygon whose width runs from the crack's width down to nothing. */
export function taperedOutline(crack: DungeonCrack): Vec[] {
  const pts = crack.points;
  const n = pts.length;
  if (n < 2) return [];
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const half = (crack.width / 2) * (1 - i / (n - 1));
    const normal = miterNormal(pts, i);
    const p = pts[i]!;
    left.push({ x: p.x + normal.x * half, y: p.y + normal.y * half });
    right.push({ x: p.x - normal.x * half, y: p.y - normal.y * half });
  }
  return [...left, ...right.reverse()];
}

/** The offset direction at a corner, lengthened so both sides keep their width (capped at 2). */
function miterNormal(pts: readonly CellPoint[], i: number): Vec {
  const normalOf = (a: CellPoint, b: CellPoint): Vec => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  };
  const before = i > 0 ? normalOf(pts[i - 1]!, pts[i]!) : null;
  const after = i < pts.length - 1 ? normalOf(pts[i]!, pts[i + 1]!) : null;
  if (!before) return after!;
  if (!after) return before;
  const sx = before.x + after.x;
  const sy = before.y + after.y;
  const len = Math.hypot(sx, sy) || 1;
  const m = { x: sx / len, y: sy / len };
  const scale = Math.min(2, 1 / Math.max(0.5, m.x * after.x + m.y * after.y));
  return { x: m.x * scale, y: m.y * scale };
}
