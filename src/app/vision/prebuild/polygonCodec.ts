import type { Point } from '../../types/visionTypes';
import { knownPolygonBox } from '../polygonBounds';
import type { Polygon } from '../visibility';

/** Polygons packed into one buffer of coordinates: `starts[i]` to `starts[i + 1]` are polygon `i`'s points. */
export interface PackedPolygons {
  coords: Float64Array;
  starts: Uint32Array;
}

/** Collects polygons and packs them once all are in (`pack`); `add` names each by its place. */
export class PolygonPacker {
  private readonly polygons: Polygon[] = [];

  add(polygon: Polygon): number {
    this.polygons.push(polygon);
    return this.polygons.length - 1;
  }

  pack(): PackedPolygons {
    const starts = new Uint32Array(this.polygons.length + 1);
    this.polygons.forEach((polygon, i) => { starts[i + 1] = starts[i]! + polygon.length; });
    const coords = new Float64Array(2 * starts[this.polygons.length]!);
    let at = 0;
    for (const polygon of this.polygons) {
      for (const { x, y } of polygon) {
        coords[at++] = x;
        coords[at++] = y;
      }
    }
    return { coords, starts };
  }
}

/**
 * Polygon `index` of `packed` as points, with its box worked out on the way (`knownPolygonBox`),
 * which the explored memory and the rules ask of every polygon.
 */
export function unpackPolygon({ coords, starts }: PackedPolygons, index: number): Polygon {
  const polygon: Point[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let at = 2 * starts[index]!, end = 2 * starts[index + 1]!; at < end; at += 2) {
    const x = coords[at]!;
    const y = coords[at + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    polygon.push({ x, y });
  }
  knownPolygonBox(polygon, { minX, minY, maxX, maxY });
  return polygon;
}
