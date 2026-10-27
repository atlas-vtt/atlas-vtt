import type { CellPoint } from '../model';
import { cellKey } from '../geometry';

/**
 * Outlines of a set of whole cells, in cell corners: one ring per piece the cells make side by
 * side. A piece with a hole in it, or one whose ring would pass `maxCorners`, is given as the
 * rectangles of its rows instead, so every ring is simple and the area it holds is exactly the cells'.
 */
export function cellOutlines(given: readonly CellPoint[], maxCorners: number): CellPoint[][] {
  const taken = new Set(given.map(c => cellKey(c.x, c.y)));
  const cells = [...taken].map(key => {
    const [x, y] = key.split(',').map(Number) as [number, number];
    return { x, y };
  });
  const has = (x: number, y: number): boolean => taken.has(cellKey(x, y));
  const rings = boundaryRings(cells, has);
  // A ring that turns the other way round is a hole: its cells' rows stand in for the outlines
  const holes = rings.some(ring => signedArea(ring) < 0);
  if (!holes && rings.every(ring => ring.length <= maxCorners)) return rings;
  return rowRectangles(cells);
}

/**
 * The boundary of the cells as rings, clockwise on screen (y down) around what they hold, each
 * corner where the boundary turns. Where two cells touch at one corner only, the walk keeps to
 * its own cell (it turns right), so the pieces stay apart.
 */
function boundaryRings(cells: readonly CellPoint[], has: (x: number, y: number) => boolean): CellPoint[][] {
  const edges = new Map<string, CellPoint[]>();
  const add = (from: CellPoint, to: CellPoint): void => {
    const key = cellKey(from.x, from.y);
    edges.set(key, [...(edges.get(key) ?? []), to]);
  };
  for (const { x, y } of cells) {
    if (!has(x, y - 1)) add({ x, y }, { x: x + 1, y });
    if (!has(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!has(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!has(x - 1, y)) add({ x, y: y + 1 }, { x, y });
  }
  const rings: CellPoint[][] = [];
  for (const [startKey, starts] of edges) {
    while (starts.length > 0) {
      const [sx, sy] = startKey.split(',').map(Number) as [number, number];
      const ring: CellPoint[] = [{ x: sx, y: sy }];
      let at = { x: sx, y: sy };
      let heading = { x: 0, y: 0 };
      for (;;) {
        const out = edges.get(cellKey(at.x, at.y));
        if (!out || out.length === 0) break;
        // Of two ways on, the right turn (on screen, y down): the cross product of heading and way is positive
        const pick = out.length === 1 ? 0 : out.findIndex(to => heading.x * (to.y - at.y) - heading.y * (to.x - at.x) > 0);
        const [to] = out.splice(Math.max(0, pick), 1) as [CellPoint];
        heading = { x: to.x - at.x, y: to.y - at.y };
        at = to;
        if (at.x === sx && at.y === sy) break;
        ring.push(at);
      }
      rings.push(withoutStraights(ring));
    }
  }
  return rings;
}

/** The ring without corners that lie on a straight line between their neighbours. */
function withoutStraights(ring: readonly CellPoint[]): CellPoint[] {
  return ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length]!;
    const b = ring[(i + 1) % ring.length]!;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
}

/** Twice the ring's area, positive where it runs clockwise on screen. */
function signedArea(ring: readonly CellPoint[]): number {
  return ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
}

/** The cells as rectangles, one per run of cells side by side in a row. */
function rowRectangles(cells: readonly CellPoint[]): CellPoint[][] {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: CellPoint[][] = [];
  for (let i = 0; i < sorted.length; ) {
    const { x, y } = sorted[i]!;
    let end = x;
    while (sorted[i + 1]?.y === y && sorted[i + 1]?.x === end + 1) {
      end++;
      i++;
    }
    i++;
    out.push([{ x, y }, { x: end + 1, y }, { x: end + 1, y: y + 1 }, { x, y: y + 1 }]);
  }
  return out;
}
