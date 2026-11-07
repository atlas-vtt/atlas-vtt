import { grownRings, unionRings } from './clipShapes';
import { pointInPolygon, pointsBounds, shapeRings, signedArea2, type Bounds, type Vec } from './geometry';
import type { VisibleDungeon } from './visibleDungeon';

/**
 * Pockets: narrow stretches of rock that rooms and doors close in on every side, such as the gap
 * between a rotunda and the rooms it lies between. The hatching band reaches a fixed distance
 * from the walls, so in a pocket wider than twice that it left a ragged island of paper inside
 * the dungeon, read as a stray floor. A pocket is rock through and through: it is shaded and
 * hatched whole, as the band would be had it met itself. Wider enclosed spaces (a courtyard a
 * loop of rooms walls in) stay open ground, except in a cave, where all rock is rock (`caveRock`).
 */
export interface Pocket {
  ring: Vec[];
  bounds: Bounds;
}

/** How finely the rock's outline follows a rotunda; its edges lie under walls and floor. */
const OUTLINE_PX_PER_CELL = 30;
/** Spacing of the points that tell how far into a pocket the walls are, in cells. */
const PROBE = 0.1;
/** How far a pocket the band closes off reaches under the band, in cells, so no seam shows where they meet. */
const UNDER_BAND = 0.1;
/**
 * How much nearer than twice the band two walls may come and still close the rock behind, in
 * cells: a band's strokes run past its edge, so a neck its bands only touch reads closed, and a
 * grown outline's round corners are polygons that leave a hairline where they touch.
 */
const NECK_SLACK = 0.1;

const enclosed = new WeakMap<VisibleDungeon, Pocket[]>();
const caves = new WeakMap<VisibleDungeon, { distance: number; pockets: Pocket[] }>();

const floorRings = (dungeon: VisibleDungeon): Vec[][] => dungeon.floors.flatMap(shape => shapeRings(shape, 0, OUTLINE_PX_PER_CELL));

/** Rock the floors close in on all sides: the holes in the union of the floors. */
function enclosedRock(dungeon: VisibleDungeon): Pocket[] {
  const known = enclosed.get(dungeon);
  if (known) return known;
  const found = holesOf(unionRings(floorRings(dungeon))).map(asPocket);
  enclosed.set(dungeon, found);
  return found;
}

/** The rings that run against the largest one: the holes of a union whose largest ring is an outline. */
function holesOf(rings: readonly Vec[][]): Vec[][] {
  let outward = 0;
  for (const ring of rings) {
    const area = signedArea2(ring);
    if (Math.abs(area) > Math.abs(outward)) outward = area;
  }
  return rings.filter(ring => ring.length >= 3 && Math.sign(signedArea2(ring)) === -Math.sign(outward));
}

const asPocket = (ring: Vec[]): Pocket => ({ ring, bounds: pointsBounds(ring) });

/**
 * The rock a band `distance` wide round the floors closes off from the open paper: where two walls
 * come closer than twice the band, the bands meet and the rock behind them, a bay of a cave or the
 * rock round a loop of passages, has no way out. Each reaches a little under the band.
 */
function bandClosedRock(dungeon: VisibleDungeon, distance: number): Pocket[] {
  // Growing unites the rings it grows; a hole turned round is an outline, which grows outward: under the band.
  return holesOf(grownRings(floorRings(dungeon), distance + NECK_SLACK)).map(hole => asPocket(grownRings([[...hole].reverse()], NECK_SLACK + UNDER_BAND)[0]!));
}

/**
 * The enclosed rock filled whole round a band `distance` wide. In a building, the pockets no point
 * of which lies farther than twice `distance` from a floor. In a cave every stretch of rock is rock
 * (`caveRock`), so it is all the floors close in on, and all the band closes off.
 */
export function filledPockets(dungeon: VisibleDungeon, distance: number): Pocket[] {
  if (dungeon.floor.cave) return caveRock(dungeon, distance);
  return enclosedRock(dungeon).filter(pocket => isNarrow(dungeon, pocket, distance * 2));
}

/** A cave's enclosed rock: every hole of its floors, and the rock its band closes off beyond them. */
function caveRock(dungeon: VisibleDungeon, distance: number): Pocket[] {
  const known = caves.get(dungeon);
  if (known?.distance === distance) return known.pockets;
  const holes = enclosedRock(dungeon);
  const closed = bandClosedRock(dungeon, distance).filter(({ ring }) => !inPocket(holes, ring[0]!.x, ring[0]!.y));
  const pockets = [...holes, ...closed];
  caves.set(dungeon, { distance, pockets });
  return pockets;
}

/** Whether a point lies in one of `pockets`. */
export function inPocket(pockets: readonly Pocket[], x: number, y: number): boolean {
  return pockets.some(({ ring, bounds }) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY && pointInPolygon(ring, x, y));
}

/** Whether no point of a pocket lies farther than `reach` from a floor. */
function isNarrow(dungeon: VisibleDungeon, { ring, bounds }: Pocket, reach: number): boolean {
  for (let y = bounds.minY + PROBE / 2; y < bounds.maxY; y += PROBE) {
    for (let x = bounds.minX + PROBE / 2; x < bounds.maxX; x += PROBE) {
      if (dungeon.field.distance(x, y) > reach && pointInPolygon(ring, x, y)) return false;
    }
  }
  return true;
}
