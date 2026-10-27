import type { Vec } from '../geometry';
import { valueNoise } from '../art/noise';

/**
 * A lip cut by hand rather than ruled: every edge broken into short pieces that wander a little
 * either side of the cell boundary, so the drop still fills its whole cells.
 */
export function chiselled(poly: readonly Vec[], seed: number, amount = 0.04): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const n = Math.max(1, Math.round(len / 0.08));
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      const corner = Math.min(u, 1 - u) * len;
      const o = k === 0 ? 0 : ((valueNoise(x * 4.3, y * 4.3, seed) - 0.5) * 2 * amount + (valueNoise(x * 13, y * 13, seed + 1) - 0.5) * amount * 0.6) * Math.min(1, corner / 0.15);
      out.push({ x: x + nx * o, y: y + ny * o });
    }
  }
  return out;
}

/** A broken stone round `c`: a few flat fracture faces and chipped corners, as split stone looks. */
export function stoneOutline(rng: () => number, c: Vec, r: number): Vec[] {
  const n = 7 + Math.floor(rng() * 4);
  const turn = rng() * Math.PI * 2;
  const stretch = 0.7 + rng() * 0.5;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const pts: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const t = ((k + (rng() - 0.5) * 0.6) / n) * Math.PI * 2;
    const rr = r * (k % 3 === 0 ? 0.7 + rng() * 0.15 : 0.88 + rng() * 0.22);
    const x = Math.cos(t) * rr * stretch;
    const y = Math.sin(t) * rr;
    pts.push({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos });
  }
  return pts;
}
