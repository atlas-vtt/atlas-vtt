import type { CellPoint } from '../model';
import { pointInPolygon, pointsBounds } from '../render/geometry';

/**
 * How far a point lies from a set of thick lines (each segment with how far it reaches either
 * side), in cells, negative within their reach: a river's water, a road. Asked a few million times
 * by a drawing, so the segments lie in a grid of buckets in flat arrays; beyond a bucket from every
 * segment it answers Infinity. `inside` areas (a lake) count as within, `dry` ones (an island) a
 * little way out.
 */

type Vec = CellPoint;

export interface LineField {
  distance(x: number, y: number): number;
}

/** The size of the buckets the segments are filed in, in cells; a point is measured against its own bucket and those round it. */
const BUCKET = 4;

/** `segments`: five numbers each, its two ends and its reach. */
export function lineField(segments: readonly number[], inside: readonly (readonly Vec[])[] = [], dry: readonly (readonly Vec[])[] = []): LineField {
  if (!segments.length && !inside.length) return { distance: () => Infinity };
  const count = segments.length / 5;
  const cell = (k: number): [number, number] => [Math.floor((segments[k * 5]! + segments[k * 5 + 2]!) / 2 / BUCKET), Math.floor((segments[k * 5 + 1]! + segments[k * 5 + 3]!) / 2 / BUCKET)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < count; k++) {
    const [bx, by] = cell(k);
    x0 = Math.min(x0, bx); y0 = Math.min(y0, by); x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
  }
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  // Buckets as offsets into one list of segment indices.
  const starts = new Int32Array(cols * rows + 1);
  for (let k = 0; k < count; k++) { const [bx, by] = cell(k); starts[(by - y0) * cols + (bx - x0) + 1]! += 1; }
  for (let b = 0; b < cols * rows; b++) starts[b + 1]! += starts[b]!;
  const filled = starts.slice(0, cols * rows);
  const order = new Int32Array(count);
  for (let k = 0; k < count; k++) { const [bx, by] = cell(k); order[filled[(by - y0) * cols + (bx - x0)]!++] = k; }
  const flat = Float64Array.from(segments);
  const lakeBounds = inside.map((area) => pointsBounds(area));
  const islandBounds = dry.map((area) => pointsBounds(area));
  return {
    distance: (x, y) => {
      const bx = Math.floor(x / BUCKET) - x0;
      const by = Math.floor(y / BUCKET) - y0;
      let best = Infinity;
      for (let j = Math.max(0, by - 1); j <= Math.min(rows - 1, by + 1); j++) for (let i = Math.max(0, bx - 1); i <= Math.min(cols - 1, bx + 1); i++) {
        const bucket = j * cols + i;
        for (let n = starts[bucket]!; n < starts[bucket + 1]!; n++) {
          const o = order[n]! * 5;
          const ax = flat[o]!, ay = flat[o + 1]!;
          const dx = flat[o + 2]! - ax;
          const dy = flat[o + 3]! - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
          const ex = x - ax - dx * t;
          const ey = y - ay - dy * t;
          best = Math.min(best, Math.sqrt(ex * ex + ey * ey) - flat[o + 4]!);
        }
      }
      // A dry area (an island) lies a little way out of the reach.
      for (let k = 0; k < dry.length; k++) {
        const b = islandBounds[k]!;
        if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && pointInPolygon(dry[k]!, x, y)) return 0.05;
      }
      // An area's edge is measured from both sides: inside it the distance counts as within.
      for (let k = 0; k < inside.length; k++) {
        const b = lakeBounds[k]!;
        if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && pointInPolygon(inside[k]!, x, y)) return -Math.abs(best);
      }
      return best;
    },
  };
}
