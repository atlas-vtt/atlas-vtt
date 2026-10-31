import type { CellPoint } from '../model';
import type { Rng } from '../rng';

type Vec = CellPoint;

/** The corners of a lake's outline. */
const CORNERS = 72;

/**
 * A lake's shore round `centre`, longest along `heading` (the way the river comes in): an oval
 * `length` cells long and `breadth` across, its shore pushed in and out by a few slow waves, so it
 * has bays and points rather than a lens's even curve, but never a bay deeper than a fifth of it.
 */
export function lakeOutline(centre: Vec, heading: number, length: number, breadth: number, rng: Rng): Vec[] {
  const waves = [2, 3, 5].map((count) => ({ count, phase: rng() * Math.PI * 2, size: (0.06 + rng() * 0.07) * (count === 2 ? 1.4 : 1) }));
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return Array.from({ length: CORNERS }, (_, k) => {
    const a = (k / CORNERS) * Math.PI * 2;
    const r = 1 + waves.reduce((sum, w) => sum + Math.sin(a * w.count + w.phase) * w.size, 0);
    const u = Math.cos(a) * (length / 2) * r;
    const v = Math.sin(a) * (breadth / 2) * r;
    return { x: centre.x + u * cos - v * sin, y: centre.y + u * sin + v * cos };
  });
}

