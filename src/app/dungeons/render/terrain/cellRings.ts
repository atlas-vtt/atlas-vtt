/**
 * The outline of a set of whole cells: closed rings along its border, clockwise on screen (the
 * cells on the right of the way round), cells touching only at a corner kept apart. Terrain is
 * drawn from these, so its edges lie exactly on cell lines.
 */

import type { CellPoint } from '../../model';
import type { Canvas2D, Vec } from '../geometry';

interface Edge {
  from: Vec;
  to: Vec;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** The border edges of the cells, each with the cells on its right. */
function borderEdges(cells: readonly CellPoint[]): Edge[] {
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const edges: Edge[] = [];
  for (const { x, y } of cells) {
    if (!set.has(key(x, y - 1))) edges.push({ from: { x, y }, to: { x: x + 1, y } });
    if (!set.has(key(x + 1, y))) edges.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 } });
    if (!set.has(key(x, y + 1))) edges.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 } });
    if (!set.has(key(x - 1, y))) edges.push({ from: { x, y: y + 1 }, to: { x, y } });
  }
  return edges;
}

/** Closed rings of corner points round the cells; straight runs are one edge. */
export function cellRings(cells: readonly CellPoint[]): Vec[][] {
  const edges = borderEdges(cells);
  const starting = new Map<string, Edge[]>();
  for (const edge of edges) starting.set(key(edge.from.x, edge.from.y), [...(starting.get(key(edge.from.x, edge.from.y)) ?? []), edge]);
  const used = new Set<Edge>();
  const rings: Vec[][] = [];
  for (const first of edges) {
    if (used.has(first)) continue;
    const ring: Vec[] = [];
    let edge: Edge | undefined = first;
    while (edge && !used.has(edge)) {
      used.add(edge);
      ring.push(edge.from);
      const d = { x: edge.to.x - edge.from.x, y: edge.to.y - edge.from.y };
      const next: Edge[] = (starting.get(key(edge.to.x, edge.to.y)) ?? []).filter((e) => !used.has(e));
      // Where two rings touch at a corner, turn right (towards the cells), so each stays its own.
      const turn = (e: Edge): number => {
        const n = { x: e.to.x - e.from.x, y: e.to.y - e.from.y };
        const cross = d.x * n.y - d.y * n.x;
        return cross > 0 ? 0 : cross === 0 ? 1 : 2;
      };
      edge = next.sort((a, b) => turn(a) - turn(b))[0];
    }
    rings.push(simplify(ring));
  }
  return rings;
}

/** Drops the corners that lie on a straight run. */
function simplify(ring: Vec[]): Vec[] {
  return ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length] as Vec;
    const b = ring[(i + 1) % ring.length] as Vec;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
}

/** A ring moved `d` cells towards its cells (outwards for a negative `d`); its edges stay on lines parallel to the cells'. */
export function insetRing(ring: readonly Vec[], d: number): Vec[] {
  return ring.map((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length] as Vec;
    const b = ring[(i + 1) % ring.length] as Vec;
    const n1 = rightNormal(a, p);
    const n2 = rightNormal(p, b);
    return { x: p.x + (n1.x + n2.x) * d, y: p.y + (n1.y + n2.y) * d };
  });
}

/** The unit normal on the right of the way from `a` to `b` (towards the cells). */
function rightNormal(a: Vec, b: Vec): Vec {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/** Adds the rings to the current path. */
export function traceRings(ctx: Canvas2D, rings: readonly (readonly Vec[])[]): void {
  for (const ring of rings) {
    ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }
}

/** The cells' bounding box. */
export function cellBox(cells: readonly CellPoint[]): { x: number; y: number; w: number; h: number } {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/** The border edges of the cells that face cells of `next` (for a lip between a hole and the floor beside it, or a platform's open sides). */
export function edgesFacing(cells: readonly CellPoint[], next: (c: CellPoint) => boolean): Edge[] {
  return borderEdges(cells).filter((edge) => {
    const d = { x: edge.to.x - edge.from.x, y: edge.to.y - edge.from.y };
    // The cell outside lies on the left of the way along the edge.
    const mid = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 };
    const out = { x: Math.floor(mid.x + d.y * 0.5), y: Math.floor(mid.y - d.x * 0.5) };
    return next(out);
  });
}

export type { Edge as CellEdge };
