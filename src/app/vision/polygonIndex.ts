import type { Point } from '../types/visionTypes';
import { polygonBox } from './polygonBounds';
import { pointInPolygon, type Polygon } from './visibility';

/** About this many edges to a band: a query reads the edges of one band. */
const EDGES_PER_BAND = 8;
const MAX_BANDS = 4096;

/** A polygon's edges sorted into horizontal bands: every edge in each band its y range touches. */
interface Bands {
  minY: number;
  maxY: number;
  height: number;
  count: number;
  /** The edges of band k are `edges[starts[k]]` up to `edges[starts[k + 1]]`; edge i runs from point i to the one before it. */
  starts: Int32Array;
  edges: Int32Array;
}

/** Per polygon: how often it was asked about before it had bands, or its bands. Polygons are never changed in place. */
const indexes = new WeakMap<Polygon, Bands | number>();

/** Bands are built for a polygon asked about this many times: one asked once costs no more than `pointInPolygon`. */
const ASKED_BEFORE_BANDS = 2;

/**
 * `pointInPolygon`, to the last bit, for a polygon asked about many times: from its second
 * question on, only the edges whose y range holds the point's y are counted. An edge counts
 * exactly when one end lies above the point and one not, so the others never change the answer.
 */
export function insidePolygon(point: Point, polygon: Polygon): boolean {
  let bands = indexes.get(polygon);
  if (typeof bands !== 'object') {
    const asked = (bands ?? 0) + 1;
    bands = asked < ASKED_BEFORE_BANDS ? undefined : bandsOf(polygon);
    indexes.set(polygon, bands ?? asked);
    if (!bands) return pointInPolygon(point, polygon);
  }
  const { y } = point;
  // Above, below and NaN: no edge holds the point's y.
  if (!(y >= bands.minY && y < bands.maxY)) return false;
  const band = bandOf(y, bands);
  const n = polygon.length;
  let inside = false;
  for (let e = bands.starts[band]!, end = bands.starts[band + 1]!; e < end; e++) {
    const i = bands.edges[e]!;
    const a = polygon[i]!;
    const b = polygon[i === 0 ? n - 1 : i - 1]!;
    if ((a.y > y) !== (b.y > y) && point.x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The band of a y within the polygon's height: monotone in y, so an edge's bands hold every y between its ends. */
function bandOf(y: number, bands: Bands): number {
  return bands.count === 1 ? 0 : Math.min(bands.count - 1, Math.max(0, Math.floor((y - bands.minY) / bands.height)));
}

function bandsOf(polygon: Polygon): Bands {
  const { minY, maxY } = polygonBox(polygon);
  const n = polygon.length;
  const count = Number.isFinite(maxY - minY) && maxY > minY ? Math.max(1, Math.min(MAX_BANDS, Math.ceil(n / EDGES_PER_BAND))) : 1;
  const bands: Bands = { minY, maxY, height: count === 1 ? Infinity : (maxY - minY) / count, count, starts: new Int32Array(count + 1), edges: new Int32Array(0) };
  // An edge that lies level, or has an end that is no number, never counts.
  const span = (i: number): [number, number] | null => {
    const a = polygon[i]!.y;
    const b = polygon[i === 0 ? n - 1 : i - 1]!.y;
    if (a === b || Number.isNaN(a) || Number.isNaN(b)) return null;
    return [bandOf(Math.min(a, b), bands), bandOf(Math.max(a, b), bands)];
  };
  const counts = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) {
    const s = span(i);
    if (s) for (let k = s[0]; k <= s[1]; k++) counts[k + 1]!++;
  }
  for (let k = 0; k < count; k++) counts[k + 1]! += counts[k]!;
  bands.starts = counts.slice();
  bands.edges = new Int32Array(counts[count]!);
  for (let i = 0; i < n; i++) {
    const s = span(i);
    if (s) for (let k = s[0]; k <= s[1]; k++) bands.edges[counts[k]!++] = i;
  }
  return bands;
}
