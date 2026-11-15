import { MAX_Q, Q_SCALE, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';

const doubleBits = new DataView(new ArrayBuffer(8));

/** Exact integer × power-of-two representation of a finite number. */
function dyadic(value: number): readonly [bigint, number] {
  if (Number.isInteger(value)) return [BigInt(value), 0];
  doubleBits.setFloat64(0, value);
  const bits = doubleBits.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  let integer = bits & ((1n << 52n) - 1n);
  if (exponent !== 0) integer += 1n << 52n;
  if ((bits >> 63n) !== 0n) integer = -integer;
  return [integer, exponent === 0 ? -1074 : exponent - 1075];
}

function orientation(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const left = dx * (y - ay);
  const right = dy * (x - ax);
  const determinant = left - right;
  const magnitude = Math.abs(left) + Math.abs(right);
  // The integer edge deltas are exact. Bound subtraction/product roundoff before trusting the sign.
  if (magnitude >= 2 ** -1022 && Math.abs(determinant) > magnitude * Number.EPSILON * 4) return determinant;

  const [qx, ex] = dyadic(x);
  const [qy, ey] = dyadic(y);
  const exponent = Math.min(ex, ey, 0);
  const exact = (BigInt(dx) * qy << BigInt(ey - exponent))
    - (BigInt(dy) * qx << BigInt(ex - exponent))
    + ((BigInt(dy) * BigInt(ax) - BigInt(dx) * BigInt(ay)) << BigInt(-exponent));
  return exact < 0n ? -1 : exact > 0n ? 1 : 0;
}

/** What an edge says of a point that lies on it. */
const ON_EDGE = 2;

/** What the edge from a to b adds to the winding number round a point, or `ON_EDGE` where the point lies on it. */
function edgeTurn(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const cross = orientation(ax, ay, bx, by, x, y);
  if (cross === 0 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return ON_EDGE;
  if (ay <= y) return by > y && cross > 0 ? 1 : 0;
  return by <= y && cross < 0 ? -1 : 0;
}

/** NonZero membership of canonical boundary rings; retained boundaries count as covered. */
export function shapeContains(shape: QShape, point: Point): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Shape queries must have finite coordinates');
  const x = point.x * Q_SCALE;
  const y = point.y * Q_SCALE;
  if (Math.abs(x) > MAX_Q || Math.abs(y) > MAX_Q) return false;
  let winding = 0;
  for (const ring of shape) {
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      const turn = edgeTurn(ring[i]!, ring[i + 1]!, ring[next]!, ring[next + 1]!, x, y);
      if (turn === ON_EDGE) return true;
      winding += turn;
    }
  }
  return winding !== 0;
}

/** Most bands a shape's edges are filed in. */
const MOST_BANDS = 4096;

/**
 * `shapeContains` for many points of one shape: the same answer for every point, from the few edges
 * that pass the point's height instead of all of them. An edge says nothing of a point above or
 * below it, so the edges are filed by the level bands they pass, each about as tall as an edge.
 */
export function shapeContainment(shape: QShape): (point: Point) => boolean {
  let [top, bottom, edges, heights] = [Infinity, -Infinity, 0, 0];
  for (const ring of shape) {
    for (let i = 1; i < ring.length; i += 2) {
      const [ay, by] = [ring[i]!, ring[(i + 2) % ring.length]!];
      top = Math.min(top, ay);
      bottom = Math.max(bottom, ay);
      heights += Math.abs(by - ay);
      edges++;
    }
  }
  if (edges === 0 || !Number.isFinite(top) || !Number.isFinite(bottom)) return (point) => shapeContains(shape, point);
  const band = Math.max(Q_SCALE, heights / edges, (bottom - top) / MOST_BANDS);
  const bandOf = (y: number): number => Math.floor((y - top) / band);
  const bands: number[][] = Array.from({ length: bandOf(bottom) + 1 }, () => []);
  for (const ring of shape) {
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      const [ax, ay, bx, by] = [ring[i]!, ring[i + 1]!, ring[next]!, ring[next + 1]!];
      for (let at = bandOf(Math.min(ay, by)); at <= bandOf(Math.max(ay, by)); at++) bands[at]!.push(ax, ay, bx, by);
    }
  }
  return (point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Shape queries must have finite coordinates');
    const x = point.x * Q_SCALE;
    const y = point.y * Q_SCALE;
    if (Math.abs(x) > MAX_Q || Math.abs(y) > MAX_Q || y < top || y > bottom) return false;
    const filed = bands[bandOf(y)]!;
    let winding = 0;
    for (let i = 0; i < filed.length; i += 4) {
      const turn = edgeTurn(filed[i]!, filed[i + 1]!, filed[i + 2]!, filed[i + 3]!, x, y);
      if (turn === ON_EDGE) return true;
      winding += turn;
    }
    return winding !== 0;
  };
}
