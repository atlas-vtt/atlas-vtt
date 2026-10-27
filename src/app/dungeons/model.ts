/**
 * A generated dungeon, in grid cells (x right, y down): one or more floors in one cell grid, so a
 * stairwell covers the same cells on both floors it joins. The first entrance door of the entry
 * floor sits at (0, 0). Everything a renderer and the scene writer need, and nothing they derive.
 * It holds no text and no story: a dungeon is named only by the GM, and only its scene carries that name.
 * Cell (x, y) covers [x, x + 1) × [y, y + 1); points (columns, props, water, rubble, cracks) are
 * in that continuous space, so a cell's centre is (x + 0.5, y + 0.5) and columns stand on grid vertices.
 */

import type { CaveFloor, CaveModel, StairWay } from './caveModel';
import type { DungeonGrowth } from './growthModel';
import type { DungeonStack, DungeonWindow, FloorWalls, HouseGrounds } from './houseModel';
import type { PropKind } from './props/propKinds';
import type { RoomTypeId } from './themes/roomTypes';
import type { ThemeChoice, ThemeId } from './themes/themeTypes';
import type { DungeonTerrain, FiveRoomStage } from './terrainModel';

export type { CoverLevel, DungeonTerrain, FiveRoomStage, HazardKind, TerrainKind, TerrainOpening, TerrainTraits } from './terrainModel';
export { FIVE_ROOM_STAGES } from './terrainModel';
export type { DungeonGrowth, GrowthKind } from './growthModel';
export type { CaveFault, CaveFloor, CaveModel, CaveVariant, StairWay } from './caveModel';
export type { DungeonStack, DungeonWindow, FloorWalls, GroundsKind, GroundsPiece, HouseGrounds, OutbuildingUse, WindowSize } from './houseModel';
export type { PropKind } from './props/propKinds';

/** Bump when the same seed and tags would give another dungeon. */
export const DUNGEON_GENERATOR_VERSION = 3;

export interface CellPoint {
  x: number;
  y: number;
}

export interface CellDir {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

/** Normal rooms count towards size and get numbers; corridors are one cell wide and a junction is 1 × 1, unless the params widen them (`DungeonParams.passageFloor`, `layout/passageWidths.ts`). */
export type RoomKind = 'room' | 'corridor' | 'junction';

/** Secret rooms lie behind a secret door, off every way a party must take. */
export type Wing = 'regular' | 'secret';

export interface DungeonRoom {
  id: number;
  /** Floor rectangle, walls excluded, in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: RoomKind;
  /** Drawn as a circle through the four cardinal door cells (radius √(w² + 1) / 2). */
  rotunda: boolean;
  wing: Wing;
  /** Rooms of one mirror group share it; equal seeds grew identical subtrees. */
  group: number;
  /** Parent room id, or null for the first room. */
  parent: number | null;
  /** The axis the room grew along, from its parent into it. */
  axis: CellDir;
  /** Column rows along the long walls, or a ring in a rotunda. */
  colonnade: boolean;
  /**
   * The boss room: the room of the floor furthest from the entrance floor farthest from where it is entered, larger than the
   * rooms around it and reached through one room only. An arena, not a story: nothing is locked.
   */
  boss: boolean;
  /** In a five-room dungeon, which of the five main rooms this is; unset in every other room. */
  stage?: FiveRoomStage;
  /** What a normal room was built for, in a theme with a room programme; unset otherwise. */
  type?: RoomTypeId;
  /**
   * The room's floor once a cave shaped it: a chamber's cells inside its rectangle, a tunnel's up
   * to one cell past it. Unset, the floor is the rectangle (`floorCellsOf`).
   */
  cells?: CellPoint[];
}

/**
 * What stands in a door cell, as a character in the room would see it: an opening (a gap in the
 * wall), a door, a secret door (drawn as wall), or steps where the floor changes height.
 */
export type DoorKind = 'opening' | 'door' | 'secret' | 'steps';

export interface DungeonDoor {
  /** The door cell in the shared wall. */
  x: number;
  y: number;
  /** From the parent room (or the outside) into the child room. */
  dir: CellDir;
  kind: DoorKind;
  /** Room on each side; `from` is null for the outside of an entrance. */
  from: number | null;
  to: number | null;
  /** Steps that lead down from `from` to `to`; unset, they lead up. */
  descends?: true;
  /** Two cells wide, a cave's narrows or an opening between two wide passages: this cell and the one at `x + wide.x, y + wide.y` (`doorCells`). */
  wide?: CellDir;
  /**
   * On a floor whose walls stand on cell edges (`DungeonFloor.walls`): the door stands on the edge
   * between `(x, y)`, the cell on its `from` side (outside, for an entrance), and the cell across it
   * towards `dir`. Read where it is through `doorSide`, `doorwayCells` and `doorMiddle`.
   */
  edge?: true;
}

/**
 * One end of a stairwell between two floors: the same rectangle of cells inside a room on both,
 * against a wall, the room still passable around it. The treads descend towards `down`.
 */
export interface DungeonStair {
  /** In cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  down: CellDir;
  /** The index of the floor the stairs lead to. */
  to: number;
  /** Shared by the two ends of one stairwell. */
  link: number;
  /** In a cave, how the two floors are joined; both ends carry the same. */
  way?: StairWay;
}

export interface DungeonProp {
  kind: PropKind;
  /** Centre, in cells. */
  x: number;
  y: number;
  /** Radians; 0 faces up (towards −y). */
  rotation: number;
  /** Scale, 1 = the prop's natural size. */
  scale: number;
  room: number;
  /** A piece stretched past its footprint (flowstone along its wall), in cells along and out from its front. */
  size?: { along: number; out: number };
}

export interface DungeonColumn {
  x: number;
  y: number;
  /** In cells. */
  radius: number;
  square: boolean;
  shattered: boolean;
}

/** A small stone: a smoothed quad around its centre. */
export interface DungeonRubble {
  points: CellPoint[];
}

/** A tapered zig-zag from a wall into a room; `width` at its start, in cells. */
export interface DungeonCrack {
  points: CellPoint[];
  width: number;
}

/** A closed pool outline (already smoothed), clipped to floors by the renderer. */
export interface DungeonWater {
  outline: CellPoint[];
}

/** One floor of a dungeon. Room ids count from 0 on every floor; an entrance is a door with `from === null`. */
export interface DungeonFloor {
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
  columns: DungeonColumn[];
  props: DungeonProp[];
  rubble: DungeonRubble[];
  cracks: DungeonCrack[];
  water: DungeonWater[];
  /** Floor cells under water, for exports. */
  waterCells: CellPoint[];
  stairs: DungeonStair[];
  /** Cover, difficult ground, hazards, holes, bridges, height and points of interest (`terrainModel.ts`). */
  terrain: DungeonTerrain[];
  /** What grows on its walls, columns and floor (`growthModel.ts`); thick undergrowth is terrain. */
  growth: DungeonGrowth[];
  /**
   * Secret wings the GM hid (Hide room), by the id of each wing's first room; never set by the
   * generator. The view's secret rooms switch hides every secret wing whatever this says.
   */
  hiddenWings?: number[];
  /** A Cavern floor's lane, heights, water and faults. */
  cave?: CaveFloor;
  /** Set on every floor of a house: walls on the edges between cells (`houseModel.ts`); unset, rooms are walled by whole cells. */
  walls?: FloorWalls;
  /** A house's windows, in its outer walls. */
  windows?: DungeonWindow[];
  /** A house's chimney stacks on this floor. */
  stacks?: DungeonStack[];
  /** The grounds round a house, on its entrance floor. */
  grounds?: HouseGrounds;
}

export interface DungeonModel {
  version: number;
  seed: number;
  /** Fortress, Haunted Mansion or Cavern: one per dungeon. */
  theme: ThemeId;
  /** The tags the dungeon was built with: the GM's that its theme takes, and those added by chance (`dungeonTags`). */
  tags: string[];
  /** Index 0 is the entry floor (A), each next one farther from it: below in a Cavern, above in a Fortress or Haunted Mansion (`stackOf`). */
  floors: DungeonFloor[];
  /** A Cavern's variant and fault directions. */
  cave?: CaveModel;
  /** How many floors lie under the entrance floor: the last indices, going down (a house's cellar). Unset is none. */
  below?: number;
}

/** What a GM asks for: everything else follows from it. */
export interface DungeonRequest {
  seed: number;
  /** The theme asked for; unset is Any, which the seed decides (`pickTheme`). */
  theme?: ThemeChoice;
  tags: string[];
  /** How many floors, 1 to `MAX_FLOORS`. */
  floors: number;
  /** Whether the floor furthest from the entrance has a boss room (`DungeonRoom.boss`); unset is yes. */
  bossRoom?: boolean;
  /**
   * A five-room dungeon (`DungeonRoom.stage`): one floor, five main rooms in a row joined by
   * passages, the fourth the boss room whatever `bossRoom` says. Unset is no.
   */
  fiveRoom?: boolean;
  /** 0..1; unset follows the tags (dry 0, wet 0.3, flooded 0.6, else random). */
  waterLevel?: number;
}

export const MAX_FLOORS = 4;

/** A floor count as a request may hold it: a whole number from 1 to `MAX_FLOORS`. */
export function floorCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_FLOORS, Math.max(1, Math.round(value))) : 1;
}

/** How many floors a request makes: a five-room dungeon has one whatever `floors` says. */
export function requestedFloors(request: Pick<DungeonRequest, 'floors' | 'fiveRoom'>): number {
  return request.fiveRoom === true ? 1 : floorCount(request.floors);
}
