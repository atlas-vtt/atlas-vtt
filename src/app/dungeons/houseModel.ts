/**
 * What a house adds to a dungeon floor (`DungeonFloor.walls === 'edges'`, only the Haunted Mansion's
 * house planner sets it): walls on the edges between cells instead of whole cells of rock, windows in
 * its outer walls, chimney stacks of masonry, and on the entrance floor the grounds round it. In cells,
 * as everything else in the model.
 */

import type { CellDir, CellPoint } from './model';

/** How a floor's walls stand: unset, a ring of whole cells round every room; `edges`, on the edges between cells. */
export type FloorWalls = 'edges';

/**
 * A window in an outer wall, one cell long: in the room's cell (`x`, `y`), on the edge towards `dir`,
 * which leads out of the house. It stops a token and lets sight and light through.
 */
export interface DungeonWindow {
  x: number;
  y: number;
  dir: CellDir;
  room: number;
  /** Unset, a window of the facade; `tall`, a stair hall's window rising past its landing; `small`, a closet's or a cellar's, set high in the wall. Still one cell long. */
  size?: WindowSize;
}

export type WindowSize = 'tall' | 'small';

/** A chimney stack: masonry cells inside the house that are no room's floor, the same cells on every floor it rises through. */
export interface DungeonStack {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the grounds of a house hold; the generator offers only those `drawnKinds.ts` lists. */
export const GROUNDS_KINDS = ['garden', 'path', 'drive', 'hedge', 'boundary-wall', 'gate', 'porch', 'outbuilding', 'tree', 'garden-fountain'] as const;

export type GroundsKind = (typeof GROUNDS_KINDS)[number];

/** What an outbuilding was built for: structure only, its inside empty. */
export type OutbuildingUse = 'carriage-house' | 'stable' | 'greenhouse' | 'crypt';

/**
 * One piece of the grounds, on whole cells: a lawn, a path or drive, a hedge, the boundary wall, a
 * gate (`dir` the way in), a porch before a door (`columns` its posts), an outbuilding (its walls
 * round `cells`, its door at `door`), a tree (`at` its trunk, `radius` its crown) or a fountain.
 */
export interface GroundsPiece {
  kind: GroundsKind;
  cells: CellPoint[];
  dir?: CellDir;
  at?: CellPoint;
  radius?: number;
  columns?: CellPoint[];
  use?: OutbuildingUse;
  /** An outbuilding's door: the cell outside it and the way in, on the edge between them. */
  door?: { x: number; y: number; dir: CellDir };
}

/** The ground a house stands on: its lot (the boundary's outer edge) and what lies on it. */
export interface HouseGrounds {
  lot: { x: number; y: number; w: number; h: number };
  pieces: GroundsPiece[];
}
