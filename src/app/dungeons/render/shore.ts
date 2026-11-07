import { pointInPolygon, pointSegmentDistance, signedArea2, type Vec } from './geometry';

/**
 * The outline moved inward by `inset`, cut where the naive offset folds over itself (tight bays,
 * narrow necks), so each returned run lies a full inset inside the shore.
 */
export function insetRuns(outline: readonly Vec[], inset: number): Vec[][] {
  const n = outline.length;
  if (n < 3) return [];
  const inward = signedArea2(outline) > 0 ? 1 : -1;
  const shifted: (Vec | null)[] = [];
  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n]!;
    const next = outline[(i + 1) % n]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // Clockwise on screen, the inside lies to the right of the direction of travel.
    const p = outline[i]!;
    const q = { x: p.x - (ty / len) * inset * inward, y: p.y + (tx / len) * inset * inward };
    shifted.push(pointInPolygon(outline, q.x, q.y) && distanceToOutline(outline, q) > inset * 0.85 ? q : null);
  }
  const start = shifted.findIndex(p => p === null);
  const runs: Vec[][] = [];
  let run: Vec[] = [];
  for (let k = 0; k <= n; k++) {
    const p = shifted[((start < 0 ? 0 : start) + k) % n] ?? null;
    if (p) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (start < 0 && run.length) runs.push([...run]);
  else if (run.length) runs.push(run);
  return runs.filter(r => r.length > 2);
}

function distanceToOutline(outline: readonly Vec[], p: Vec): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    best = Math.min(best, pointSegmentDistance(p, outline[i]!, outline[(i + 1) % outline.length]!));
  }
  return best;
}
