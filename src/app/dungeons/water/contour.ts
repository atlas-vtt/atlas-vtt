/**
 * Traces the boundary of a set of cells into closed loops of grid vertices, wet on the right of
 * the way round (screen coordinates, y down). Where two wet cells touch only at a corner, the
 * trace turns right, so they come out as separate loops.
 */

import type { CellPoint } from '../model';
import { type CellGrid, WET } from './wetGrid';

interface Edge {
  from: CellPoint;
  to: CellPoint;
}

function key(p: CellPoint): string {
  return `${p.x},${p.y}`;
}

function boundaryEdges(grid: CellGrid, wet: Uint8Array): Edge[] {
  const isWet = (gx: number, gy: number): boolean => gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h && wet[gy * grid.w + gx] === WET;
  const edges: Edge[] = [];
  for (let gy = 0; gy < grid.h; gy++) {
    for (let gx = 0; gx < grid.w; gx++) {
      if (!isWet(gx, gy)) continue;
      const x = gx + grid.x0;
      const y = gy + grid.y0;
      if (!isWet(gx, gy - 1)) edges.push({ from: { x, y }, to: { x: x + 1, y } });
      if (!isWet(gx + 1, gy)) edges.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 } });
      if (!isWet(gx, gy + 1)) edges.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 } });
      if (!isWet(gx - 1, gy)) edges.push({ from: { x, y: y + 1 }, to: { x, y } });
    }
  }
  return edges;
}

/** Of the edges leaving a vertex, the one turning most to the right of the way in. */
function nextEdge(options: Edge[], incoming: Edge): Edge | undefined {
  const dx = incoming.to.x - incoming.from.x;
  const dy = incoming.to.y - incoming.from.y;
  const turn = (e: Edge): number => {
    const ex = e.to.x - e.from.x;
    const ey = e.to.y - e.from.y;
    const cross = dx * ey - dy * ex;
    return cross > 0 ? 0 : cross === 0 ? 1 : 2;
  };
  return [...options].sort((a, b) => turn(a) - turn(b))[0];
}

/** Drops vertices in the middle of straight runs. */
function corners(loop: CellPoint[]): CellPoint[] {
  return loop.filter((p, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length] as CellPoint;
    const next = loop[(i + 1) % loop.length] as CellPoint;
    return (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x) !== 0;
  });
}

export function traceLoops(grid: CellGrid, wet: Uint8Array): CellPoint[][] {
  const leaving = new Map<string, Edge[]>();
  for (const edge of boundaryEdges(grid, wet)) leaving.set(key(edge.from), [...(leaving.get(key(edge.from)) ?? []), edge]);
  const loops: CellPoint[][] = [];
  for (const start of [...leaving.keys()]) {
    for (;;) {
      const first = leaving.get(start)?.[0];
      if (!first) break;
      const loop = walkLoop(leaving, first);
      if (loop.length >= 4) loops.push(corners(loop));
    }
  }
  return loops;
}

function walkLoop(leaving: Map<string, Edge[]>, first: Edge): CellPoint[] {
  let edge: Edge | undefined = first;
  const loop: CellPoint[] = [];
  while (edge) {
    const current: Edge = edge;
    const from = leaving.get(key(current.from)) ?? [];
    from.splice(from.indexOf(current), 1);
    loop.push(current.from);
    edge = nextEdge(leaving.get(key(current.to)) ?? [], current);
  }
  return loop;
}
