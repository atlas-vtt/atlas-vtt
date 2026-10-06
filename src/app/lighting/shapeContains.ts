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
      const ax = ring[i]!;
      const ay = ring[i + 1]!;
      const bx = ring[next]!;
      const by = ring[next + 1]!;
      const cross = orientation(ax, ay, bx, by, x, y);
      if (cross === 0 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
      if (ay <= y) {
        if (by > y && cross > 0) winding++;
      } else if (by <= y && cross < 0) winding--;
    }
  }
  return winding !== 0;
}
