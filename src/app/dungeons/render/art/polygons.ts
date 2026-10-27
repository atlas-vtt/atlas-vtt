import { signedArea2, type Vec } from '../geometry';

/** A convex polygon with every edge moved `d` inward; null when it vanishes. */
export function insetConvex(poly: readonly Vec[], d: number): Vec[] | null {
  const n = poly.length;
  if (n < 3) return null;
  const turn = signedArea2(poly) > 0 ? 1 : -1;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Clockwise on screen, the inside lies to the right of the way along an edge.
    const nx = (-(b.y - a.y) / len) * turn;
    const ny = ((b.x - a.x) / len) * turn;
    return { p: { x: a.x + nx * d, y: a.y + ny * d }, t: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
  });
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n]!;
    const l2 = lines[i]!;
    const den = l1.t.x * l2.t.y - l1.t.y * l2.t.x;
    if (Math.abs(den) < 1e-9) {
      out.push(l2.p);
      continue;
    }
    const s = ((l2.p.x - l1.p.x) * l2.t.y - (l2.p.y - l1.p.y) * l2.t.x) / den;
    out.push({ x: l1.p.x + l1.t.x * s, y: l1.p.y + l1.t.y * s });
  }
  return signedArea2(out) * signedArea2(poly) > 0 ? out : null;
}

/** A polygon with its corners rounded by up to `r` (less on short edges). */
export function traceRounded(path: CanvasPath, poly: readonly Vec[], r: number): void {
  const n = poly.length;
  if (n < 3) return;
  const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(poly[n - 1]!, poly[0]!);
  path.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const prev = poly[(i + n - 1) % n]!;
    const rr = Math.min(r, Math.hypot(q.x - p.x, q.y - p.y) / 2.2, Math.hypot(p.x - prev.x, p.y - prev.y) / 2.2);
    const m = mid(p, q);
    path.arcTo(p.x, p.y, m.x, m.y, rr);
  }
  path.closePath();
}
