import { Matrix } from 'pixi.js';
import type { LevelStack } from '../../../levels/levelStack';

/** The longest side of a level below's snapshot, in its texels: the stack's grid never has more. */
export const SNAPSHOT_MAX_SIDE = 2048;
/** The finest snapshot texel, in world pixels: a map's own pixel. */
const SNAPSHOT_MIN_TEXEL = 1;

/**
 * Where a level below's snapshot lies (`BelowSnapshots`): over the stack's box, on the stack's own
 * grid, each stack texel split into `sub` × `sub` snapshot texels, so every snapshot texel lies in
 * exactly one stack texel and the composite reads the level only where the stack shows it.
 */
export interface SnapshotGrid {
  /** The stack's box: its first texel in the stack's grid, and how many it has. */
  x: number;
  y: number;
  columns: number;
  rows: number;
  /** Snapshot texels a side in one stack texel. */
  sub: number;
  /** A snapshot texel's side in world pixels. */
  texel: number;
  /** The snapshot's size in texels. */
  width: number;
  height: number;
}

/**
 * The snapshot grid over `stack`'s box: as fine as fits `SNAPSHOT_MAX_SIDE` texels a side, never
 * finer than a world pixel; null while the stack shows only the viewed level.
 */
export function snapshotGrid(stack: LevelStack | null): SnapshotGrid | null {
  const box = stack?.box;
  if (!stack || !box) return null;
  const { texel } = stack.grid;
  const fitting = Math.floor(SNAPSHOT_MAX_SIDE / Math.max(box.columns, box.rows));
  const sub = Math.max(1, Math.min(fitting, Math.floor(texel / SNAPSHOT_MIN_TEXEL)));
  return {
    x: box.x, y: box.y, columns: box.columns, rows: box.rows,
    sub, texel: texel / sub, width: box.columns * sub, height: box.rows * sub,
  };
}

export function sameSnapshotGrid(a: SnapshotGrid | null, b: SnapshotGrid | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.columns === b.columns && a.rows === b.rows && a.sub === b.sub && a.texel === b.texel;
}

/** World pixels to the snapshot's texels. */
export function snapshotCamera(grid: SnapshotGrid): Matrix {
  return new Matrix(1 / grid.texel, 0, 0, 1 / grid.texel, -grid.x * grid.sub, -grid.y * grid.sub);
}

/**
 * The camera a level below's map and roof images read their tiles from (`MapImage`): the snapshot's
 * rect at its texel, never the view's, so panning and zooming the view loads and changes nothing
 * below. Aimed at nothing it asks for no tiles. (It has the shape of a `MapImageViewport`.)
 */
export class SnapshotView {
  left = 0;
  top = 0;
  worldScreenWidth = 0;
  worldScreenHeight = 0;
  readonly scale = { x: 0 };
  worldWidth = 0;
  worldHeight = 0;

  /** Aims at `grid` for a renderer of `resolution` (a map image takes a screen pixel as 1 / (scale × resolution) world px). */
  aim(grid: SnapshotGrid | null, resolution: number): void {
    if (!grid) {
      this.scale.x = 0;
      this.worldScreenWidth = 0;
      this.worldScreenHeight = 0;
      return;
    }
    const stackTexel = grid.texel * grid.sub;
    this.left = grid.x * stackTexel;
    this.top = grid.y * stackTexel;
    this.worldScreenWidth = grid.columns * stackTexel;
    this.worldScreenHeight = grid.rows * stackTexel;
    this.scale.x = 1 / (grid.texel * resolution);
  }
}
