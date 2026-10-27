/**
 * The signed distance to a polygon with holes (negative inside), answered from an index of its
 * edges per cell, so a query reads only the edges near it however long the outline is.
 *
 * Distance: the edges of the cells round the query's cell, ring by ring, until the nearest found
 * is no farther than the ring (every edge beyond lies at least that far). Inside: the parity of a
 * reference point in each cell is worked out once along its row, and a query adds the crossings
 * of the way from that point to itself, which only edges touching the cell can make.
 */

import type { Vec } from '../geometry';

/** Off the cell's middle by amounts no outline of halves and quarters lands on. */
const REF_X = 0.5 + Math.SQRT2 / 1000;
const REF_Y = 0.5 + Math.PI / 10000;

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function segmentDistance(px: number, py: number, e: Edge): number {
  const ex = e.bx - e.ax;
  const ey = e.by - e.ay;
  const len = ex * ex + ey * ey;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - e.ax) * ex + (py - e.ay) * ey) / len));
  return Math.hypot(px - (e.ax + ex * t), py - (e.ay + ey * t));
}

/** Whether the segment p→q crosses the edge (half-open at the edge's end, so a shared corner counts once). */
function crosses(px: number, py: number, qx: number, qy: number, e: Edge): boolean {
  const d1 = (e.bx - e.ax) * (py - e.ay) - (e.by - e.ay) * (px - e.ax);
  const d2 = (e.bx - e.ax) * (qy - e.ay) - (e.by - e.ay) * (qx - e.ax);
  if (d1 > 0 === d2 > 0) return false;
  const d3 = (qx - px) * (e.ay - py) - (qy - py) * (e.ax - px);
  const d4 = (qx - px) * (e.by - py) - (qy - py) * (e.bx - px);
  return d3 > 0 !== d4 > 0;
}

export class PolyField {
  private readonly edges: Edge[] = [];
  private readonly x0: number;
  private readonly y0: number;
  private readonly w: number;
  private readonly h: number;
  /** Edge indices touching each cell. */
  private readonly buckets: number[][];
  /** Whether each cell's reference point lies inside. */
  private readonly parity: Uint8Array;

  constructor(rings: readonly (readonly Vec[])[]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        this.edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
        minX = Math.min(minX, a.x);
        minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, a.x);
        maxY = Math.max(maxY, a.y);
      }
    }
    if (this.edges.length === 0) minX = minY = maxX = maxY = 0;
    this.x0 = Math.floor(minX) - 1;
    this.y0 = Math.floor(minY) - 1;
    this.w = Math.floor(maxX) - this.x0 + 2;
    this.h = Math.floor(maxY) - this.y0 + 2;
    this.buckets = Array.from({ length: this.w * this.h }, () => []);
    this.edges.forEach((e, k) => {
      for (let y = Math.floor(Math.min(e.ay, e.by)); y <= Math.floor(Math.max(e.ay, e.by)); y++) {
        for (let x = Math.floor(Math.min(e.ax, e.bx)); x <= Math.floor(Math.max(e.ax, e.bx)); x++) this.buckets[(y - this.y0) * this.w + (x - this.x0)]!.push(k);
      }
    });
    this.parity = this.rowParities();
  }

  /** The inside of every cell's reference point, by scanning each row's line once. */
  private rowParities(): Uint8Array {
    const parity = new Uint8Array(this.w * this.h);
    const rows: number[][] = Array.from({ length: this.h }, () => []);
    this.edges.forEach((e, k) => {
      for (let y = Math.floor(Math.min(e.ay, e.by)); y <= Math.floor(Math.max(e.ay, e.by)); y++) rows[y - this.y0]!.push(k);
    });
    for (let gy = 0; gy < this.h; gy++) {
      const y = this.y0 + gy + REF_Y;
      const xs: number[] = [];
      for (const k of rows[gy]!) {
        const e = this.edges[k]!;
        if (e.ay > y !== e.by > y) xs.push(e.ax + ((y - e.ay) * (e.bx - e.ax)) / (e.by - e.ay));
      }
      xs.sort((a, b) => a - b);
      let next = 0;
      for (let gx = 0; gx < this.w; gx++) {
        const x = this.x0 + gx + REF_X;
        while (next < xs.length && xs[next]! < x) next++;
        parity[gy * this.w + gx] = next % 2;
      }
    }
    return parity;
  }

  private cellAt(x: number, y: number): number {
    const gx = Math.floor(x) - this.x0;
    const gy = Math.floor(y) - this.y0;
    return gx < 0 || gy < 0 || gx >= this.w || gy >= this.h ? -1 : gy * this.w + gx;
  }

  /** Whether the point lies inside an outer ring and outside its holes. */
  inside(x: number, y: number): boolean {
    const cell = this.cellAt(x, y);
    if (cell < 0) return false;
    const rx = Math.floor(x) + REF_X;
    const ry = Math.floor(y) + REF_Y;
    let odd = this.parity[cell] === 1;
    for (const k of this.buckets[cell]!) if (crosses(rx, ry, x, y, this.edges[k]!)) odd = !odd;
    return odd;
  }

  /** Distance to the nearest edge. */
  private unsigned(x: number, y: number): number {
    const cx = Math.floor(x) - this.x0;
    const cy = Math.floor(y) - this.y0;
    const span = Math.max(this.w, this.h) + Math.abs(cx) + Math.abs(cy);
    let best = Infinity;
    for (let r = 0; r <= span; r++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= this.h) continue;
        const edge = gy === cy - r || gy === cy + r;
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
          if (gx < 0 || gx >= this.w) continue;
          for (const k of this.buckets[gy * this.w + gx]!) best = Math.min(best, segmentDistance(x, y, this.edges[k]!));
        }
      }
      if (best <= r) break;
    }
    return best;
  }

  /** Signed distance to the outline: negative inside. */
  distance(x: number, y: number): number {
    const d = this.unsigned(x, y);
    return this.inside(x, y) ? -d : d;
  }
}
