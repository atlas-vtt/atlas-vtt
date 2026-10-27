/**
 * What a Cavern's model holds beyond the rooms of every theme: the cave's variant and the
 * directions its faults run, and per floor the main path's way two cells wide, where the floor
 * lies low, where water stands and runs, and the fault lines that cross it.
 */

import type { CellPoint } from './model';

/** Limestone (karst) by default, a lava tube with `lava`, the Underdark for large, spacious or deep caves. */
export type CaveVariant = 'limestone' | 'lava-tube' | 'underdark';

/** How a stairwell joins two cave floors: a pitch (a shaft on a rope, an aven seen from below) or a scree slope. */
export type StairWay = 'pitch' | 'scree';

/** A fault line across a floor: its direction in radians from +x, through a point, in cells. */
export interface CaveFault {
  angle: number;
  x: number;
  y: number;
}

/** The whole cave's geology. Whether it is lived in shows in its room types (a guard post at the mouth). */
export interface CaveModel {
  variant: CaveVariant;
  /** The one or two directions every fault of the cave runs in, radians from +x. */
  faults: number[];
}

export interface CaveFloor {
  /** The main path's way two cells wide on this floor. */
  lane: CellPoint[];
  /** By room id; lower is deeper. */
  heights: number[];
  faults: CaveFault[];
  /** Rooms that hold standing water. */
  basins: number[];
  /** Chains of rooms, uphill first, each ending in a basin; a lived-in cave's spring by its mouth is a chain of one. */
  streams: number[][];
  /** Basins whose water a dam holds (perched). */
  dams: number[];
}
