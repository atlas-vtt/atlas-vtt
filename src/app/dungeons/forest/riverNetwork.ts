import type { CellPoint, DungeonRiver } from '../model';
import type { Rng } from '../rng';
import { fractalNoise } from '../water/noise';
import { COURSE_STEP, riverCourse } from './riverCourse';
import { bends, normalAt, waterField } from './riverShape';

/**
 * How a Forest's river grows from the streams that join it. A river's width follows the water it
 * carries (hydraulic geometry: width as the square root of the flow), so above each confluence the
 * river is narrower by the share the stream brings, and the stream is as wide as its share; a
 * stream meets the river at an acute angle that points downstream, as rivers join.
 */

type Vec = CellPoint;

/** How far beyond the floor a stream rises, so it comes in past the map's edge. */
const BEYOND = 10;
/** No stream is narrower than this, in cells: a trickle under it is not drawn. */
const NARROWEST = 0.45;
/** How many points below a confluence the river takes to widen to what it carries: about four cells. */
const WIDENING = 16;

/** Where a stream joins the main river (a point of it) and the share of the river's water below that it brings. */
export interface Confluence {
  at: number;
  share: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Up to `count` confluences on the river's course above `before` (a lake's mouth, or its end),
 * each bringing a quarter to nearly a half of the water below it, far enough apart to read as two.
 */
export function confluencesOn(line: readonly Vec[], before: number, count: number, rng: Rng): Confluence[] {
  const found: Confluence[] = [];
  for (let k = 0; k < count; k++) {
    const at = Math.floor(before * (0.2 + rng() * 0.55));
    if (found.some((c) => Math.abs(c.at - at) * COURSE_STEP < 12)) continue;
    found.push({ at, share: 0.25 + rng() * 0.2 });
  }
  return found.sort((a, b) => a.at - b.at);
}

/** The share of the water at the river's lower end that flows past its point `i`: every stream that joins below takes its share away. */
function flowAt(confluences: readonly Confluence[], i: number): number {
  return confluences.reduce((flow, c) => {
    if (i <= c.at) return flow * (1 - c.share);
    // Below a confluence the river widens over a few cells to what it now carries.
    const t = Math.min(1, (i - c.at) / WIDENING);
    return flow * (1 - c.share * (1 - t * t * (3 - 2 * t)));
  }, 1);
}

/**
 * A river's widths, `width` at its lower end: as the water it carries at each point allows,
 * growing a little downstream as the ground drains into it, with a slow drift and a little wider
 * where it bends.
 */
export function flowWidths(line: readonly Vec[], width: number, confluences: readonly Confluence[], rng: Rng): number[] {
  const drift = fractalNoise(rng, 2, 0.5, 30);
  const bent = bends(line);
  const last = Math.max(1, line.length - 1);
  return line.map((_, i) => {
    const growth = 0.85 + 0.15 * (i / last);
    const bend = 1 + 0.15 * Math.min(1, Math.abs(bent[i]!) * width * 2);
    return Math.max(NARROWEST, width * Math.sqrt(flowAt(confluences, i)) * growth * (1 + 0.12 * drift(i * COURSE_STEP, 3.1)) * bend);
  });
}

/**
 * The stream that joins the river at `confluence`, as wide as its share of the water there: it
 * leaves the confluence upstream at 35° to 60° off the river's own way, towards one side, is laid
 * from there to beyond the floor's edge, and is turned round to flow down into the river. None
 * where it would be a trickle, or would cross the river before it joins it.
 */
export function streamInto(main: DungeonRiver, confluence: Confluence, swing: number, bounds: Bounds, rng: Rng): DungeonRiver | null {
  const { points } = main;
  const join = points[confluence.at]!;
  // Its share of the water the river carries once it has joined.
  const width = Math.sqrt(confluence.share) * main.widths[Math.min(main.widths.length - 1, confluence.at + WIDENING)]!;
  if (width < NARROWEST) return null;
  const n = normalAt(points, confluence.at);
  const first = rng() < 0.5 ? -1 : 1;
  const angle = ((35 + rng() * 25) * Math.PI) / 180;
  const winding = { width, swing: swing * (0.7 + rng() * 0.5) };
  const reach = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + BEYOND;
  const river = waterField([main]);
  const clear = (line: readonly Vec[]): boolean => {
    const before = line.length - Math.ceil((main.widths[confluence.at]! + width) / COURSE_STEP);
    return !line.slice(0, before).some((p) => river.distance(p.x, p.y) < 0.4);
  };
  // From one side, else the other: it meets the river once, where it joins it.
  const line = [first, -first].map((side) => {
    const upstream = Math.atan2(-n.x, n.y) + Math.PI + side * angle;
    const source = { x: join.x + Math.cos(upstream) * reach, y: join.y + Math.sin(upstream) * reach };
    return riverCourse([join, source], winding, rng, upstream).reverse();
  }).find(clear);
  if (!line) return null;
  // A stream too grows towards its mouth.
  const widths = line.map((_, i) => Math.max(NARROWEST, width * (0.7 + 0.3 * (i / Math.max(1, line.length - 1)))));
  return { points: line, widths, bridges: [] };
}
