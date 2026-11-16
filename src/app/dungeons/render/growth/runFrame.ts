import type { Vec } from '../geometry';

/**
 * A wall run as a frame a climber grows in: `s` along the wall's foot (cells from its first
 * point), `h` across it, positive up the wall and over its top, negative out onto the floor.
 */
export interface RunFrame {
  length: number;
  /** The point at (s, h). */
  at(s: number, h: number): Vec;
}

/** The frame of a run of points, `upOf` the way up the wall at a point (a unit vector, roughly across the run). */
export function runFrame(points: readonly Vec[], upOf: (p: Vec) => Vec): RunFrame {
  const n = points.length;
  const lengths = [0];
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  // Tangents smoothed over neighbours, so a corner turns the frame gently instead of folding it.
  const tangent = points.map((_, i) => {
    const a = points[Math.max(0, i - 2)]!;
    const b = points[Math.min(n - 1, i + 2)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  });
  // Up is across the run: of its two normals, the one on the side `upOf` points to.
  const up = points.map((p, i) => {
    const t = tangent[i]!;
    const n1 = { x: -t.y, y: t.x };
    const u = upOf(p);
    return u.x * n1.x + u.y * n1.y < 0 ? { x: -n1.x, y: -n1.y } : n1;
  });
  const length = lengths[n - 1] ?? 0;
  const locate = (s: number): { i: number; f: number } => {
    const c = Math.max(0, Math.min(length, s));
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid]! <= c) lo = mid;
      else hi = mid;
    }
    const span = lengths[hi]! - lengths[lo]! || 1;
    return { i: lo, f: (c - lengths[lo]!) / span };
  };
  const mix = (list: readonly Vec[], i: number, f: number): Vec => {
    const a = list[i]!;
    const b = list[Math.min(n - 1, i + 1)]!;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  return {
    length,
    at(s, h) {
      const { i, f } = locate(s);
      const p = mix(points, i, f);
      const u = mix(up, i, f);
      // Past either end the run goes on straight.
      const over = s < 0 ? s : s > length ? s - length : 0;
      const t = mix(tangent, i, f);
      return { x: p.x + u.x * h + t.x * over, y: p.y + u.y * h + t.y * over };
    },
  };
}
