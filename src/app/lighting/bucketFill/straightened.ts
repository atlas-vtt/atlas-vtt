import type { Point } from '../../types/visionTypes';

/**
 * Straightens an outline traced from a painted map: a wall the art draws straight comes out of the
 * flood with small wobbles and jogs, each a corner and so a wall of its own. Consecutive pieces
 * become one wall while they run the same way and none of the corners between strays far from it;
 * a jog too short to be a wall of its own does not count as a change of direction. Corners, alcoves
 * and curves (whose pieces turn further each time) stay.
 */

/** How far a swallowed corner may lie from the straight wall, in grid cells. */
const STRAY = 0.15;
/** How far a piece may turn from the wall it would join, in degrees. */
const TURN = 15;
/** Pieces shorter than this, in grid cells, are jogs: their direction is not looked at. */
const JOG = 0.3;

const distanceToLine = (p: Point, a: Point, b: Point): number => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = Math.hypot(dx, dy);
  return length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / length;
};

/** The angle between two directions, in degrees, 0–180. */
const turnBetween = (a: Point, b: Point, c: Point, d: Point): number => {
  const angle = Math.atan2(d.y - c.y, d.x - c.x) - Math.atan2(b.y - a.y, b.x - a.x);
  return Math.abs(((angle * 180) / Math.PI + 540) % 360 - 180);
};

/** A closed outline (no repeated first corner) with its nearly straight runs made single walls; `cell` is a grid cell in its units. */
export function straightened(ring: readonly Point[], cell: number): Point[] {
  const n = ring.length;
  if (n < 4) return [...ring];
  const at = (i: number): Point => ring[((i % n) + n) % n]!;
  const jog = JOG * cell;
  const long = (i: number): boolean => Math.hypot(at(i + 1).x - at(i).x, at(i + 1).y - at(i).y) >= jog;
  // Begin at the sharpest corner between two real walls, so no run is cut where the ring happens to start.
  let start = 0;
  let sharpest = -1;
  for (let i = 0; i < n; i++) {
    const turn = turnBetween(at(i - 1), at(i), at(i), at(i + 1));
    if (long(i - 1) && long(i) && turn > sharpest) [sharpest, start] = [turn, i];
  }
  const corners: Point[] = [];
  let anchor = start;
  while (anchor < start + n) {
    corners.push(at(anchor));
    let end = anchor + 1;
    // Extend the wall from `anchor` one piece at a time while it stays straight.
    while (end < start + n) {
      const next = end + 1;
      // The wall's own direction is known once it is longer than a jog.
      const settled = Math.hypot(at(end).x - at(anchor).x, at(end).y - at(anchor).y) >= jog;
      if (long(end) && settled && turnBetween(at(anchor), at(end), at(end), at(next)) > TURN) break;
      let fits = true;
      for (let k = anchor + 1; k < next && fits; k++) fits = distanceToLine(at(k), at(anchor), at(next)) <= STRAY * cell;
      if (!fits) break;
      end = next;
    }
    anchor = end;
  }
  return corners;
}
