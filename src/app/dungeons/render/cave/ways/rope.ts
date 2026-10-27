import type { Hand } from '../../art/hand';
import { polyPath } from '../../art/paths';
import type { Vec } from '../../geometry';

/** A laid rope as a narrow ribbon: its fill and diagonal fibre are the painter's own. */
export function rope(hand: Hand, run: Vec[]): void {
  const half = 0.018;
  const sides = [-1, 1].map(side => run.map((p, i) => {
    const a = run[Math.max(0, i - 1)]!;
    const b = run[Math.min(run.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: p.x - (b.y - a.y) / len * half * side, y: p.y + (b.x - a.x) / len * half * side };
  }));
  const band = [...sides[0]!, ...sides[1]!.slice().reverse()];
  // Flat: the strands drawn over it are its fibre, and a texture would not show at its width.
  hand.fill(polyPath(band), 'rope');
  hand.line(sides, 'fine');
  const strands: Vec[][] = [];
  let next = 0.04;
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]!;
    const b = run[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const tx = (b.x - a.x) / length;
    const ty = (b.y - a.y) / length;
    for (; next < length; next += 0.08) {
      const x = a.x + tx * next;
      const y = a.y + ty * next;
      strands.push([-1, 1].map(side => ({ x: x + side * (tx * 0.012 - ty * half * 0.7), y: y + side * (ty * 0.012 + tx * half * 0.7) })));
    }
    next -= length;
  }
  hand.line(strands, 'fine');
}
