/**
 * The map as rooms are told apart on it (`fogRooms.ts`): a raster in which every texel a wall
 * passes is a barrier, drawn so that no flood from texel to texel across an edge gets past a
 * wall, however it slants. What the walls leave falls into pieces, each flooded once; a piece
 * that reaches the raster's rim is open ground, any other a room.
 */

import type { MapRect } from '../grid/cellNumbering';
import type { WallSegment } from '../types/wallTypes';

/** A texel is never finer than this, in map pixels. */
const MIN_TEXEL = 2;
/** The texels a cell is told apart in, along a side. */
const TEXELS_PER_CELL = 8;
/**
 * A texel is no coarser than this where the map's size allows, in map pixels: a gap between
 * walls wider than what sealing closes (13 px on such a map) then always leaves texels free.
 */
const SEAL_TEXEL = 4;
/** The raster's longest side, in texels: a larger map gets coarser texels. */
const MAX_SIDE = 2048;
/** The texels around the map that stand for what lies beyond it: ground that reaches them is not enclosed. */
const RIM = 1;
/** Wall numbers stay below this, so a texel and a wall make one sortable number. */
const WALL_SPAN = 2 ** 21;

/** The four ways along the raster's lines, clockwise as the map is drawn: east, south, west, north. */
export const STEP_X = [1, 0, -1, 0] as const;
export const STEP_Y = [0, 1, 0, -1] as const;

/**
 * Map pixels per texel for a map of `mapRect` whose grid cells are `cell` wide: an eighth of a
 * cell, no coarser than a gap that stays open needs, and coarser than both where the map is too
 * large for that.
 */
export function roomTexel(mapRect: MapRect, cell: number): number {
  const eighth = Number.isFinite(cell) && cell > 0 ? cell / TEXELS_PER_CELL : MIN_TEXEL;
  return Math.max(MIN_TEXEL, Math.min(eighth, SEAL_TEXEL), Math.max(mapRect.width, mapRect.height) / (MAX_SIDE - 2 * RIM));
}

/** A piece of ground between barriers. */
export interface GroundPiece {
  /** Its number among the raster's pieces, counted from 1 (`pieceOf`). */
  readonly id: number;
  /** Whether it reaches the raster's rim: the walls do not enclose it. */
  readonly open: boolean;
  /** Its first texel, row by row: the leftmost of its top row. */
  readonly first: number;
}

export class RoomRaster {
  readonly width: number;
  readonly height: number;
  /** The map place of the raster's first corner. */
  readonly left: number;
  readonly top: number;
  /** 1 where a wall passes the texel. */
  readonly barrier: Uint8Array;
  /** The piece each texel of ground belongs to, counted from 1; 0 where it was not flooded yet, and on barriers. */
  readonly pieceOf: Int32Array;
  readonly pieces: GroundPiece[] = [];
  /** Every pair of a texel and a wall that passes it, as `texel * WALL_SPAN + wall`, ascending. */
  private readonly passes: Float64Array;

  constructor(readonly walls: readonly WallSegment[], mapRect: MapRect, readonly texel: number) {
    this.width = Math.max(1, Math.ceil(mapRect.width / texel)) + 2 * RIM;
    this.height = Math.max(1, Math.ceil(mapRect.height / texel)) + 2 * RIM;
    this.left = mapRect.x - RIM * texel;
    this.top = mapRect.y - RIM * texel;
    this.barrier = new Uint8Array(this.width * this.height);
    this.pieceOf = new Int32Array(this.width * this.height);
    const passes: number[] = [];
    walls.slice(0, WALL_SPAN).forEach((wall, index) => this.draw(wall, index, passes));
    this.passes = Float64Array.from(passes).sort();
  }

  /** The texel the map point lies in, or -1 beyond the raster. */
  texelAt(x: number, y: number): number {
    const tx = Math.floor((x - this.left) / this.texel);
    const ty = Math.floor((y - this.top) / this.texel);
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height ? ty * this.width + tx : -1;
  }

  /** Calls `visit` with each wall that passes the texel, in the order of the walls. */
  wallsAt(texel: number, visit: (wall: number) => void): void {
    if (texel < 0 || this.barrier[texel] !== 1) return;
    const from = texel * WALL_SPAN;
    let low = 0;
    let high = this.passes.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.passes[middle]! < from) low = middle + 1;
      else high = middle;
    }
    for (let at = low; at < this.passes.length && this.passes[at]! < from + WALL_SPAN; at++) visit(this.passes[at]! - from);
  }

  /** The piece of ground the texel belongs to, flooded now where it was not: null on a barrier and beyond the raster. */
  pieceAt(texel: number): GroundPiece | null {
    if (texel < 0 || this.barrier[texel] === 1) return null;
    return this.pieces[(this.pieceOf[texel] || this.flood(texel)) - 1] ?? null;
  }

  /** Every piece of ground, each flooded once. */
  allPieces(): readonly GroundPiece[] {
    for (let texel = 0; texel < this.barrier.length; texel++) {
      if (this.barrier[texel] === 0 && this.pieceOf[texel] === 0) this.flood(texel);
    }
    return this.pieces;
  }

  /**
   * The corners of a piece's outer edge, along the raster's lines, clockwise as the map is drawn:
   * for each, its column and row among the raster's lines and the way its edge leaves it
   * (`STEP_X`, `STEP_Y`), with the piece to the right of that edge. Holes in the piece have no
   * part in it. A corner is given for every texel passed, not only where the edge turns.
   */
  edgeOf(piece: GroundPiece): Int32Array {
    const { width, height, pieceOf } = this;
    const { id } = piece;
    const inPiece = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && pieceOf[y * width + x] === id;
    const startX = piece.first % width;
    const startY = (piece.first - startX) / width;
    const corners: number[] = [];
    let [x, y, way] = [startX, startY, 0];
    // Every edge between two texels is walked once at most.
    for (let steps = 0; steps < 4 * width * height; steps++) {
      corners.push(x, y, way);
      x += STEP_X[way]!;
      y += STEP_Y[way]!;
      // The two texels ahead: the one to the right of the way on, and the one to its left.
      const right = way === 0 ? inPiece(x, y) : way === 1 ? inPiece(x - 1, y) : way === 2 ? inPiece(x - 1, y - 1) : inPiece(x, y - 1);
      const left = way === 0 ? inPiece(x, y - 1) : way === 1 ? inPiece(x, y) : way === 2 ? inPiece(x - 1, y) : inPiece(x - 1, y - 1);
      // Texels that meet only at a corner are not one piece: the edge turns right between them.
      if (!right) way = (way + 1) & 3;
      else if (left) way = (way + 3) & 3;
      if (x === startX && y === startY && way === 0) break;
    }
    return Int32Array.from(corners);
  }

  /** Floods the ground from `seed`, row by row, and returns the number of the piece it is. */
  private flood(seed: number): number {
    const { width, height, barrier, pieceOf } = this;
    const id = this.pieces.length + 1;
    const free = (texel: number): boolean => barrier[texel] === 0 && pieceOf[texel] === 0;
    let [open, first] = [false, seed];
    const waiting = [seed];
    while (waiting.length > 0) {
      const from = waiting.pop()!;
      if (!free(from)) continue;
      const column = from % width;
      const row = from - column;
      let start = column;
      let end = column;
      while (start > 0 && free(row + start - 1)) start--;
      while (end < width - 1 && free(row + end + 1)) end++;
      pieceOf.fill(id, row + start, row + end + 1);
      if (row + start < first) first = row + start;
      if (start === 0 || end === width - 1 || row === 0 || row === (height - 1) * width) open = true;
      // One seed for each run of free texels above and below the run just filled.
      for (const beside of [row - width, row + width]) {
        if (beside < 0 || beside >= barrier.length) continue;
        let inRun = false;
        for (let texel = beside + start; texel <= beside + end; texel++) {
          const isFree = free(texel);
          if (isFree && !inRun) waiting.push(texel);
          inRun = isFree;
        }
      }
    }
    this.pieces.push({ id, open, first });
    return id;
  }

  /**
   * Marks every texel the wall passes, from texel to texel across an edge and never across a
   * corner, so the barrier has no gap a flood could pass. The part of a wall beyond the raster is left out.
   */
  private draw(wall: WallSegment, index: number, passes: number[]): void {
    const { width, height, texel } = this;
    let [ax, ay] = [(wall.p1.x - this.left) / texel, (wall.p1.y - this.top) / texel];
    let [bx, by] = [(wall.p2.x - this.left) / texel, (wall.p2.y - this.top) / texel];
    if (![ax, ay, bx, by].every(Number.isFinite)) return;
    // The share of the wall that lies on the raster.
    let [enter, leave] = [0, 1];
    const [dx, dy] = [bx - ax, by - ay];
    for (const [delta, from, size] of [[dx, ax, width], [dy, ay, height]] as const) {
      if (delta === 0) {
        if (from < 0 || from > size) return;
        continue;
      }
      const [a, b] = [(0 - from) / delta, (size - from) / delta];
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
    if (enter > leave) return;
    [bx, by] = [ax + dx * leave, ay + dy * leave];
    [ax, ay] = [ax + dx * enter, ay + dy * enter];

    const column = (value: number): number => Math.min(width - 1, Math.max(0, Math.floor(value)));
    const row = (value: number): number => Math.min(height - 1, Math.max(0, Math.floor(value)));
    let [x, y] = [column(ax), row(ay)];
    const [endX, endY] = [column(bx), row(by)];
    const [stepX, stepY] = [dx > 0 ? 1 : -1, dy > 0 ? 1 : -1];
    // How far along the wall the next line across each axis lies, and how far apart those lines are.
    let nextX = dx === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) - ax) / dx;
    let nextY = dy === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) - ay) / dy;
    const [apartX, apartY] = [dx === 0 ? Infinity : stepX / dx, dy === 0 ? Infinity : stepY / dy];
    const mark = (): void => {
      const at = y * width + x;
      this.barrier[at] = 1;
      passes.push(at * WALL_SPAN + index);
    };
    mark();
    for (let left = Math.abs(endX - x) + Math.abs(endY - y); left > 0; left--) {
      // One axis at a step: through a corner the wall marks the texel beside it too.
      if (y === endY || (x !== endX && nextX < nextY)) {
        x += stepX;
        nextX += apartX;
      } else {
        y += stepY;
        nextY += apartY;
      }
      mark();
    }
  }
}
