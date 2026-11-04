import { grownRings, intersectRings, lineRings, subtractRings } from '../render/clipShapes';
import { cheapestRoute } from '../forest/roadRoute';
import type { CellPoint } from '../model';
import { outerTurn, pointInPolygon, pointsBounds, signedArea2, type Vec } from '../render/geometry';

/**
 * What a crown may not take of a Forest's floors, however far it overhangs, so two clearings joined
 * on the floor stay joined: a lane down the middle of each neck. Only the crowns that reach the lane
 * are cut; the rest of a neck stays theirs, or every crown leaning into a passage is cut along its
 * edge and stands outside the walls.
 */

/** How much of a way's middle a crown may not close, in cells either way: enough to pass. */
export const WAY_LANE = 0.2;
/** The floors' necks, in cells: narrower than `wide` there is no room for the crowns of both sides and a way between; `shaved` is how far inside the floor a neck is looked for, `sliver` the square cells that make one, and `thin` half the width: what the opening leaves along a floor's edge may touch two parts and is no passage. */
const NECK = { wide: 1.2, shaved: 0.12, sliver: 0.08, thin: 0.04 } as const;
/** The grid a neck's middle is sought on, in cells. */
const STEP = 0.1;
/** How far past a neck and the hearts it joins that grid reaches, in cells. */
const SEARCH_MARGIN = 0.8;
/** How strongly a lane keeps to the middle: a step costs its length and this much of it over its clearance. */
const KEEP_TO_MIDDLE = 0.5;

const outerRings = (rings: readonly Vec[][]): Vec[][] => {
  const turn = outerTurn(rings);
  return rings.filter((ring) => Math.sign(signedArea2(ring)) === turn);
};

/** How far inside the floor `at` lies, in cells; 0 or less off it. */
type Clearance = (x: number, y: number) => number;

/** How far a point lies from a neck's nearest corner. */
function nearnessTo(neck: readonly Vec[], p: Vec): number {
  return neck.reduce((least, q) => Math.min(least, Math.hypot(p.x - q.x, p.y - q.y)), Infinity);
}

/** How far a ring's nearest corner lies from a neck. */
const ringNearness = (neck: readonly Vec[], ring: readonly Vec[]): number => ring.reduce((least, p) => Math.min(least, nearnessTo(neck, p)), Infinity);

/** The way through a neck from one heart of the floor to another (what is left of a wide part well inside it, beyond any crown's reach, since crowns can close a part's mouth too) over grid points on the floor, keeping to its middle; null where there is none. */
function middleOf(clearance: Clearance, neck: readonly Vec[], from: readonly Vec[], to: readonly Vec[]): Vec[] | null {
  // A heart's corners nearest the neck's own outline, nearest first; however small a heart is, it has those. A corner near the neck's box may lie across the woods from it.
  const fromNeck = (ring: readonly Vec[]): Vec[] => ring.map((p) => ({ p, off: nearnessTo(neck, p) })).sort((a, b) => a.off - b.off).map(({ p }) => p);
  const starts = fromNeck(from);
  const finishes = fromNeck(to);
  const box = pointsBounds([...neck, starts[0]!, finishes[0]!]);
  const x0 = Math.floor((box.minX - SEARCH_MARGIN) / STEP);
  const y0 = Math.floor((box.minY - SEARCH_MARGIN) / STEP);
  const w = Math.ceil((box.maxX + SEARCH_MARGIN) / STEP) - x0 + 1;
  const h = Math.ceil((box.maxY + SEARCH_MARGIN) / STEP) - y0 + 1;
  const cost = new Float32Array(w * h).fill(Infinity);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const clear = clearance(x * STEP, y * STEP);
    if (clear > 0) cost[(y - y0) * w + (x - x0)] = 1 + KEEP_TO_MIDDLE / clear;
  }
  const open = (x: number, y: number): boolean => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h && cost[(y - y0) * w + (x - x0)]! < Infinity;
  const cellsOf = (corners: readonly Vec[]): CellPoint[] => corners.map((p) => ({ x: Math.round(p.x / STEP), y: Math.round(p.y / STEP) })).filter(({ x, y }) => open(x, y));
  const start = cellsOf(starts)[0];
  const ends = cellsOf(finishes);
  if (!start || !ends[0]) return null;
  const goals = new Set(ends.map(({ x, y }) => (y - y0) * w + (x - x0)));
  const route = cheapestRoute({ x0, y0, w, h, cost }, start, (x, y) => goals.has((y - y0) * w + (x - x0)), ends[0]);
  return route && route.map(({ x, y }) => ({ x: x * STEP, y: y * STEP }));
}

/**
 * The lanes down the floors' necks: each neck is a passage too narrow to leave a way beside the
 * crowns of both sides, between two parts of the floor wide enough to. A wide part keeps a way round
 * its crowns, and a narrow bay off one part joins nothing, so neither has a lane. A neck no way is
 * found through is held whole. Slivers are no necks.
 */
export function necksOf(floors: readonly Vec[][], clearance: Clearance): Vec[][] {
  const { wide, shaved, sliver, thin } = NECK;
  const hearts = outerRings(grownRings(floors, -wide / 2));
  const opened = grownRings(hearts, wide / 2 - shaved);
  const parts = outerRings(opened);
  return subtractRings(grownRings(floors, -shaved), opened).filter((ring) => Math.abs(signedArea2(ring)) / 2 >= sliver && grownRings([ring], -thin).length > 0).flatMap((neck) => {
    const reach = grownRings([neck], shaved / 2);
    const joined = parts.filter((part) => intersectRings(reach, [part]).length > 0).flatMap((part) => hearts.filter((heart) => pointInPolygon(part, heart[0]!.x, heart[0]!.y)).sort((a, b) => ringNearness(neck, a) - ringNearness(neck, b)).slice(0, 1));
    if (joined.length < 2) return [];
    return joined.slice(1).flatMap((heart) => {
      const middle = middleOf(clearance, neck, joined[0]!, heart);
      return middle ? lineRings(middle, WAY_LANE) : grownRings([neck], shaved);
    });
  });
}
