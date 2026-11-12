import type { Point } from './wallCollision.ts';

/** How many cells away from a blocked landing a drop looks for a cell it can reach. */
const DROP_RINGS = 2;
/** Points sampled on each ring around a landing: enough to meet every cell beside it, square or hex. */
const DROP_SAMPLES = 12;

/** The places a drop near `rest` may snap to, the nearest first: every cell within `DROP_RINGS` cells (of side `cell`) around it. */
function nearbyPlaces(rest: Point, snap: (point: Point) => Point, cell: number): Point[] {
  const found = new Map<string, Point>();
  for (let ring = 1; ring <= DROP_RINGS; ring += 1) {
    const samples = DROP_SAMPLES * ring;
    for (let step = 0; step < samples; step += 1) {
      const angle = (step / samples) * 2 * Math.PI;
      const place = snap({ x: rest.x + Math.cos(angle) * ring * cell, y: rest.y + Math.sin(angle) * ring * cell });
      found.set(`${place.x},${place.y}`, place);
    }
  }
  const away = (point: Point): number => Math.hypot(point.x - rest.x, point.y - rest.y);
  return [...found.values()].sort((a, b) => away(a) - away(b));
}

/**
 * Where a dropped token's centre rests when its drag ended at `rest`: on the place the drop snaps it
 * to (`snap`, as Atlas's own drop puts it) when `reaches` finds no wall between, else on the nearest
 * such place around it that `reaches` finds clear, so a token pushed into a wall rests in the cell
 * before it and never half across it. Only where no cell nearby can be reached does it stay at
 * `rest`, and anywhere on a grid that does not snap (`snap` null). Every place it gives is reached
 * from `rest` in a straight line, so a stop at the same walls puts the token on that very place.
 */
export function dropPlace(rest: Point, snap: ((point: Point) => Point) | null, cell: number, reaches: (from: Point, to: Point) => boolean): Point {
  if (snap === null) return rest;
  const snapped = snap(rest);
  if (reaches(rest, snapped)) return snapped;
  return nearbyPlaces(rest, snap, cell).find((place) => reaches(rest, place)) ?? rest;
}
