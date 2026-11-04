import type { QPolygon, QShape } from '../../src/app/types/shapeTypes';

/** Independent strict-crossing check; shared endpoints are allowed. */
export function hasCrossing(shape: QShape): boolean {
  const edges = shape.flatMap(ring => {
    const result: number[][] = [];
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      result.push([ring[i]!, ring[i + 1]!, ring[next]!, ring[next + 1]!]);
    }
    return result;
  });
  const cross = (edge: QPolygon, x: number, y: number): bigint =>
    BigInt(edge[2]! - edge[0]!) * BigInt(y - edge[1]!) - BigInt(edge[3]! - edge[1]!) * BigInt(x - edge[0]!);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i]!;
      const b = edges[j]!;
      if (cross(a, b[0]!, b[1]!) * cross(a, b[2]!, b[3]!) < 0n
        && cross(b, a[0]!, a[1]!) * cross(b, a[2]!, a[3]!) < 0n) return true;
    }
  }
  return false;
}

export function qRectangle(x: number, y: number, width: number, height: number): QPolygon {
  return [x, y, x + width, y, x + width, y + height, x, y + height];
}
