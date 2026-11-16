/**
 * A room's floor as a graph of cells and their four neighbours, numbered once: whether a room stays
 * whole is asked for every piece terrain tries, in chambers of hundreds of cells, so it walks arrays
 * of numbers instead of cell keys, and finds every cell whose loss would split the room in one walk
 * (Tarjan's cut vertices) instead of a flood fill per cell.
 */

import { cellKey } from '../geometry';
import type { CellPoint } from '../model';

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The walkable cells' pieces: which piece each cell lies in (-1 where it cannot be walked), and how many cells each holds. */
export interface Pieces {
  of: Int32Array;
  sizes: number[];
}

export class FloorGraph {
  /** Each cell's key, by number. */
  readonly keys: string[];
  /** Each cell's number, by key. */
  private readonly index = new Map<string, number>();
  /** Each cell's neighbours on the floor, by number. */
  private readonly next: number[][];

  constructor(cells: readonly CellPoint[]) {
    this.keys = cells.map((c) => cellKey(c.x, c.y));
    this.keys.forEach((key, i) => this.index.set(key, i));
    this.next = cells.map((c) => STEPS.map(([dx, dy]) => this.index.get(cellKey(c.x + dx, c.y + dy))).filter((n): n is number => n !== undefined));
  }

  get size(): number {
    return this.next.length;
  }

  /** The cell's number; undefined where it is no floor. */
  numberOf(c: CellPoint): number | undefined {
    return this.index.get(cellKey(c.x, c.y));
  }

  /** The pieces the walkable cells fall into. */
  pieces(walkable: Uint8Array): Pieces {
    const of = new Int32Array(this.size).fill(-1);
    const sizes: number[] = [];
    const queue = new Int32Array(this.size);
    for (let s = 0; s < this.size; s++) {
      if (!walkable[s] || of[s] !== -1) continue;
      const piece = sizes.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      of[s] = piece;
      while (head < tail) {
        const v = queue[head++] as number;
        for (const n of this.next[v] as number[]) {
          if (!walkable[n] || of[n] !== -1) continue;
          of[n] = piece;
          queue[tail++] = n;
        }
      }
      sizes.push(tail);
    }
    return { of, sizes };
  }

  /** The walkable cells whose loss would split the piece `root` lies in, by number (`cut[v]` is 1). */
  cutCells(walkable: Uint8Array, root: number): Uint8Array {
    const cut = new Uint8Array(this.size);
    const order = new Int32Array(this.size).fill(-1);
    const low = new Int32Array(this.size);
    const parent = new Int32Array(this.size).fill(-1);
    const edge = new Int32Array(this.size);
    const stack = [root];
    let clock = 0;
    let rootChildren = 0;
    order[root] = low[root] = clock++;
    while (stack.length > 0) {
      const v = stack[stack.length - 1] as number;
      const around = this.next[v] as number[];
      if (edge[v]! < around.length) {
        const n = around[edge[v]!++] as number;
        if (!walkable[n]) continue;
        if (order[n] === -1) {
          parent[n] = v;
          order[n] = low[n] = clock++;
          if (v === root) rootChildren++;
          stack.push(n);
        } else if (n !== parent[v]) low[v] = Math.min(low[v]!, order[n]!);
        continue;
      }
      stack.pop();
      const p = parent[v]!;
      if (p === -1) continue;
      low[p] = Math.min(low[p]!, low[v]!);
      if (p !== root && low[v]! >= order[p]!) cut[p] = 1;
    }
    if (rootChildren > 1) cut[root] = 1;
    return cut;
  }
}
