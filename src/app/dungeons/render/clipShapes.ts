import { inflatePolyline, inflateShape, intersectShapes, subtractShapes, unionShapes } from '../../lighting/polygonClip';
import type { QShape } from '../../types/shapeTypes';
import type { Vec } from './geometry';

/**
 * Polygon union, intersection and difference in cells, through the lighting's clipping helpers, which work on
 * integers: cells are scaled to 1/1024 of a cell, far finer than any pixel a map is drawn at.
 */
const SCALE = 1024;

export type Rings = Vec[][];

function toQ(rings: readonly (readonly Vec[])[]): QShape {
  return rings
    .filter(ring => ring.length >= 3)
    .map(ring => ring.flatMap(p => [Math.round(p.x * SCALE), Math.round(p.y * SCALE)]));
}

function fromQ(shape: QShape): Rings {
  return shape.map(ring => {
    const out: Vec[] = [];
    for (let i = 0; i < ring.length; i += 2) out.push({ x: ring[i]! / SCALE, y: ring[i + 1]! / SCALE });
    return out;
  });
}

export function unionRings(rings: readonly (readonly Vec[])[]): Rings {
  return fromQ(unionShapes(toQ(rings), []));
}

/** What `a` and `b` cover both. */
export function intersectRings(a: readonly (readonly Vec[])[], b: readonly (readonly Vec[])[]): Rings {
  return fromQ(intersectShapes(toQ(a), toQ(b)));
}

/** Rings grown by `grow` cells (shrunk where negative), holes shrinking as the outer grows, with round or square corners. */
export function grownRings(rings: readonly (readonly Vec[])[], grow: number, join: 'round' | 'miter' = 'round'): Rings {
  return fromQ(inflateShape(toQ(rings), Math.round(grow * SCALE), join));
}

/**
 * How far a band's outline may stray from its true shape, in cells: a quarter of a pixel at a
 * scene's 150 pixels a cell (`DEFAULT_PX_PER_CELL`), finer than the raster a scene is zoomed into,
 * so the bands look round at any zoom. Finer cost time and points for nothing: an 800-point road
 * became a 2,600-point ring.
 */
const LINE_TOLERANCE = 1 / 600;

/**
 * Every point within `half` cells of a line, round at its ends and bends: a band that never folds
 * where the line bends tighter than its half width, as offsetting each point along its normal does.
 * The line is thinned to the points that matter within `LINE_TOLERANCE` first, since the offset
 * rounds every corner it is given.
 */
export function lineRings(line: readonly Vec[], half: number): Rings {
  if (line.length === 0 || half <= 0) return [];
  const thinned = thinnedLine(line, LINE_TOLERANCE);
  return fromQ(inflatePolyline(thinned.flatMap(p => [Math.round(p.x * SCALE), Math.round(p.y * SCALE)]), Math.round(half * SCALE), Math.max(1, Math.round(LINE_TOLERANCE * SCALE))));
}

/** A line with only the points that keep it within `tolerance` of itself (Ramer–Douglas–Peucker), its ends kept. */
function thinnedLine(line: readonly Vec[], tolerance: number): Vec[] {
  if (line.length < 3) return [...line];
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const spans: [number, number][] = [[0, line.length - 1]];
  while (spans.length) {
    const [from, to] = spans.pop()!;
    const a = line[from]!;
    const b = line[to]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const squared = dx * dx + dy * dy || 1;
    let far = -1;
    let farthest = tolerance;
    for (let i = from + 1; i < to; i++) {
      const p = line[i]!;
      // To the segment, not its line: a point the line runs past and back from is kept.
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / squared));
      const d = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    if (far < 0) continue;
    keep[far] = 1;
    spans.push([from, far], [far, to]);
  }
  return line.filter((_, i) => keep[i]);
}

/** What `a` covers and `b` does not. */
export function subtractRings(a: readonly (readonly Vec[])[], b: readonly (readonly Vec[])[]): Rings {
  return fromQ(subtractShapes(toQ(a), toQ(b)));
}
