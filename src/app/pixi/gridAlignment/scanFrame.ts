/**
 * What one frame of the grid scan holds: `ScanChoreography` works it out, `gridScanShader.ts`
 * draws it.
 */

import type { GridType } from '../../grid/GridSystem';

/** Rows of the map `(x, y) -> (a·x + b·y + c, d·x + e·y + f)`. */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];
export const IDENTITY: Affine = [1, 0, 0, 0, 1, 0];

/** A grid to draw: regular and level in a space of its own, which `toLattice` takes the world as it is drawn now into. */
export interface ScanLattice {
  gridType: GridType;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  toLattice: Affine;
}

export interface LatticeLook {
  lattice: ScanLattice | null;
  alpha: number;
  /** 0 is a sharp line, 1 the widest and faintest. */
  soft: number;
}

export interface ScanFrame {
  /** Seconds since the scan began, for what shimmers. */
  time: number;
  /** How far the map is dimmed under the scan. */
  scrim: number;
  /** How strongly the light of the search lies on the map, 0–1. */
  looking: number;
  /** The answer's swell: how far its front has come from the origin, far below zero while there is none, and how strongly it shows. */
  lock: { radius: number; glow: number };
  /** The grid shown, and the one it is taking over from. */
  front: LatticeLook;
  back: LatticeLook;
  /** The grid the detection is trying just now, shown faintly; its softness says nothing. */
  trial: LatticeLook;
  /** True in the one step the locking wave has passed the whole map: the scene's own grid may show now. */
  revealed: boolean;
  /** Nothing is left that the eye follows: at most the last of an answer's glow is still going. */
  quiet: boolean;
  /** Nothing is left to show or to move. */
  still: boolean;
}
