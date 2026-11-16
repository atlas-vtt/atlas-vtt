import type { CellPoint, DungeonRiver } from '../model';
import type { Rng } from '../rng';
import { COURSE_STEP } from './riverCourse';
import { bends, normalAt } from './riverShape';

/**
 * An island of gravel a wide river parts round and joins again below: where a river runs straight
 * and wide, it spreads its bed and drops gravel in the middle, which splits its flow in two (a
 * mid-channel bar). The river widens over the island's length, so each arm keeps water enough.
 */

type Vec = CellPoint;

/** Only a river this wide parts round an island, in cells. */
const WIDE = 1.4;
/** How much wider the river spreads round its island, at the island's middle. */
const SPREAD = 0.8;
/** How far before and after the island the river begins to spread, in cells. */
const LEAD = 1.5;

/**
 * The river with an island on its straightest wide reach where `inside` holds (seen, and away from
 * where streams join it), or as it was where it has none.
 */
export function withIsland(river: DungeonRiver, inside: (p: Vec) => boolean, rng: Rng): DungeonRiver {
  const { points, widths } = river;
  const length = 3 + rng() * 3;
  const span = Math.round((length + 2 * LEAD) / COURSE_STEP);
  const bent = bends(points);
  let best = -1;
  let straightest = Infinity;
  for (let i = 0; i + span < points.length; i += 4) {
    if (!inside(points[i]!) || !inside(points[i + (span >> 1)]!) || !inside(points[i + span]!) || widths[i + (span >> 1)]! < WIDE) continue;
    let turn = 0;
    for (let k = i; k <= i + span; k++) turn = Math.max(turn, Math.abs(bent[k]!));
    if (turn < straightest) { straightest = turn; best = i; }
  }
  if (best < 0 || straightest * widths[best]! > 0.22) return river;
  const spread = widths.map((w, i) => {
    const t = (i - best) / span;
    return t <= 0 || t >= 1 ? w : w * (1 + SPREAD * Math.sin(Math.PI * t) ** 2);
  });
  // The island itself: a lens along the middle of the spread, a little to one side.
  const lead = Math.round(LEAD / COURSE_STEP);
  const shift = (rng() - 0.5) * 0.2;
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = best + lead; i <= best + span - lead; i++) {
    const t = (i - best - lead) / (span - 2 * lead);
    const half = spread[i]! * 0.17 * Math.sin(Math.PI * t) ** 0.7;
    const n = normalAt(points, i);
    const p = points[i]!;
    const middle = spread[i]! * shift;
    left.push({ x: p.x + n.x * (middle + half), y: p.y + n.y * (middle + half) });
    right.push({ x: p.x + n.x * (middle - half), y: p.y + n.y * (middle - half) });
  }
  return { ...river, widths: spread, islands: [[...left, ...right.reverse()]] };
}
