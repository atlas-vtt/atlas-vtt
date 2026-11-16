/** Turns a staircase of cell edges into a natural shoreline. All loops are closed. */

import type { CellPoint } from '../model';
import type { Rng } from '../rng';

/** Moves every vertex by up to `amount` each way. */
export function jitter(rng: Rng, loop: readonly CellPoint[], amount: number): CellPoint[] {
  return loop.map((p) => ({ x: p.x + (rng() * 2 - 1) * amount, y: p.y + (rng() * 2 - 1) * amount }));
}

function perimeter(loop: readonly CellPoint[]): number {
  return loop.reduce((sum, p, i) => {
    const next = loop[(i + 1) % loop.length] as CellPoint;
    return sum + Math.hypot(next.x - p.x, next.y - p.y);
  }, 0);
}

/** Points about `spacing` apart along the loop, at least `least`. */
export function resample(loop: readonly CellPoint[], spacing: number, least = 3): CellPoint[] {
  const length = perimeter(loop);
  if (loop.length < 2 || length === 0) return [...loop];
  const count = Math.max(least, Math.round(length / spacing));
  const step = length / count;
  const out: CellPoint[] = [];
  let travelled = 0;
  let target = 0;
  for (let i = 0; i < loop.length && out.length < count; i++) {
    const a = loop[i] as CellPoint;
    const b = loop[(i + 1) % loop.length] as CellPoint;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    while (target <= travelled + segment && out.length < count) {
      const t = segment === 0 ? 0 : (target - travelled) / segment;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      target += step;
    }
    travelled += segment;
  }
  return out;
}

/** Chaikin's corner cutting, `rounds` times. */
export function chaikin(loop: readonly CellPoint[], rounds: number): CellPoint[] {
  let points = [...loop];
  for (let r = 0; r < rounds; r++) {
    points = points.flatMap((p, i) => {
      const q = points[(i + 1) % points.length] as CellPoint;
      return [
        { x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y },
        { x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y },
      ];
    });
  }
  return points;
}

/** Pushes the outline in and out along its normal in two slow waves that close up seamlessly. */
export function wobble(rng: Rng, loop: readonly CellPoint[], amount: number): CellPoint[] {
  const total = perimeter(loop) || 1;
  const waves = [0, 1].map(() => ({ count: Math.max(1, Math.round(total / (2 + rng() * 3))), phase: rng() * Math.PI * 2 }));
  let travelled = 0;
  return loop.map((p, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length] as CellPoint;
    const next = loop[(i + 1) % loop.length] as CellPoint;
    if (i > 0) travelled += Math.hypot(p.x - prev.x, p.y - prev.y);
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const offset = waves.reduce((sum, w) => sum + Math.sin((travelled / total) * w.count * Math.PI * 2 + w.phase), 0) * (amount / waves.length);
    return { x: p.x - (ty / len) * offset, y: p.y + (tx / len) * offset };
  });
}
