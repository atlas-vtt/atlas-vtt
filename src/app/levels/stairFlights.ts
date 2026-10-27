/**
 * Stairs that are walked (`LevelLink.flight`): the geometry of a flight on a link of four corners,
 * without levels. Which end is whose ground is decided in `levelLinks.ts` (`flightOnLevel`).
 */

import type { LevelLinkFlight } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';

/** The rows a flight may have: a damaged file must not make bands thinner than a line. */
export const MAX_FLIGHT_ROWS = 64;

/** The corners of a link a flight stands on. */
const FLIGHT_CORNERS = 4;

function isWholeBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** A flight as a file holds it, on a polygon of `corners` corners; undefined where it is none. */
export function readFlight(value: unknown, corners: number): LevelLinkFlight | undefined {
  if (!isRecord(value) || corners !== FLIGHT_CORNERS) return undefined;
  const { foot, rows } = value;
  if (!isWholeBetween(foot, 0, FLIGHT_CORNERS - 1) || !isWholeBetween(rows, 2, MAX_FLIGHT_ROWS)) return undefined;
  return { foot, rows };
}

/** A flight's ends on one level: where tokens step on and off, where they change level, and the sides they cannot cross. */
export interface FlightEnds {
  /** The edge at ground level on this level, the only one crossed. */
  open: [Point, Point];
  /** The last row at the other end, where a token put down changes level. */
  band: Point[];
  /** The other three edges. */
  closed: [Point, Point][];
}

function lerp(a: Point, b: Point, s: number): Point {
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
}

/** Corner `step` of a four-cornered polygon, counted from the corner the foot starts at. */
function cornerFromFoot(polygon: readonly Point[], foot: number, step: number): Point {
  return polygon[(foot + step) % FLIGHT_CORNERS]!;
}

/**
 * A flight's ends on its lower level (`lower`: the foot is its ground end, the head row its band)
 * or its upper level (the head is its ground end, the foot row its band). The rows run straight
 * between the foot and the head along the two sides.
 */
export function flightEnds(polygon: readonly Point[], flight: LevelLinkFlight, lower: boolean): FlightEnds {
  // The foot runs a → b, the head c → d; the sides b → c and d → a.
  const corner = (step: number): Point => cornerFromFoot(polygon, flight.foot, step);
  const [a, b, c, d] = [corner(0), corner(1), corner(2), corner(3)];
  const row = 1 / flight.rows;
  const foot: [Point, Point] = [a, b];
  const head: [Point, Point] = [c, d];
  const sides: [Point, Point][] = [[b, c], [d, a]];
  return lower
    ? { open: foot, band: [lerp(a, d, 1 - row), lerp(b, c, 1 - row), c, d], closed: [...sides, head] }
    : { open: head, band: [a, b, lerp(b, c, row), lerp(a, d, row)], closed: [foot, ...sides] };
}

/**
 * How many rows of `cell` world pixels stairs whose foot is edge `foot` of `polygon` are long,
 * from the foot's middle to the head's; at least 2, so that both ends have a row of their own.
 */
export function flightRows(polygon: readonly Point[], foot: number, cell: number): number {
  const footMiddle = lerp(cornerFromFoot(polygon, foot, 0), cornerFromFoot(polygon, foot, 1), 0.5);
  const headMiddle = lerp(cornerFromFoot(polygon, foot, 2), cornerFromFoot(polygon, foot, 3), 0.5);
  const length = Math.hypot(headMiddle.x - footMiddle.x, headMiddle.y - footMiddle.y);
  const rows = cell > 0 && Number.isFinite(length) ? Math.round(length / cell) : 2;
  return Math.min(MAX_FLIGHT_ROWS, Math.max(2, rows));
}

/** Whether a link's polygon can hold a flight. */
export function mayHoldFlight(polygon: readonly Point[]): boolean {
  return polygon.length === FLIGHT_CORNERS;
}
