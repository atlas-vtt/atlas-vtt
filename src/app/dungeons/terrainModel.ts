/**
 * A floor's terrain: what changes how a room plays, cell by cell (Map-Fu: a cell is plainly open
 * floor, difficult terrain, cover or a hazard). Every piece fills whole cells of one room's floor;
 * props (`DungeonProp`) may be smaller. Architecture only, never story: a
 * platform is where something could stand, not who stands there.
 */

import type { CellDir, CellPoint } from './model';

export type TerrainKind =
  // Half cover: low enough to shoot over.
  | 'low-wall'
  | 'rubble-heap'
  // Total cover: too tall and wide to see past.
  | 'pillar'
  | 'statue'
  | 'wall-fragment'
  | 'obelisk'
  // Difficult terrain.
  | 'rubble-field'
  | 'broken-floor'
  | 'shallow-water'
  // Undergrowth too thick to walk through freely: difficult terrain.
  | 'brambles'
  | 'thicket'
  | 'tangled-roots'
  // A cave's floor: crusts and droppings walked as any floor, rimstone dams and choked boulders that slow a step.
  | 'guano'
  | 'bone-litter'
  | 'sulphur-crust'
  | 'rimstone'
  | 'boulder-choke'
  // Where a fall from a hole above ends: loose rubble, difficult terrain.
  | 'chasm-floor'
  // Hazards.
  | 'chasm'
  | 'shaft'
  | 'channel'
  | 'deep-water'
  | 'pit'
  // A railed hole over a hall on the floor below.
  | 'gallery'
  // A hole a hand wide in the floor over a gate passage: seen through, walked over.
  | 'murder-hole'
  // Crossings and height.
  | 'bridge'
  | 'platform'
  | 'ledge'
  // Points of interest.
  | 'mosaic'
  | 'pool'
  | 'portal-ring';

export type CoverLevel = 'half' | 'three-quarters' | 'total';

/** What a hazard is, for its name and the room's note: a fall, something that burns or drowns. */
export type HazardKind = 'chasm' | 'shaft' | 'lava' | 'acid' | 'deep-water' | 'pit';

/** What the DM's hover label and the room's note read of a piece. */
export interface TerrainTraits {
  difficult?: true;
  cover?: CoverLevel;
  hazard?: HazardKind;
  /** Its top above the room's floor in steps of 5 ft (2 is 10 ft); negative is a drop. */
  elevation?: number;
  /** Something a party can look at or poke at: a mosaic, a basin, a ring of standing stones. */
  interactive?: true;
}

/**
 * A hole in a floor (chasm, shaft, gallery): the floors below show through it, and what steps
 * into it falls to `bottom`. The map image of a floor with a floor below is transparent there.
 */
export interface TerrainOpening {
  /** The floor a fall ends on, or null for a bottomless void (it reaches below the lowest floor). */
  bottom: number | null;
  /** Shared by the holes of one shaft or abyss on every floor it passes and by the piece at its bottom. */
  link: number;
}

export interface DungeonTerrain {
  /** Its index in the floor's `terrain`. */
  id: number;
  kind: TerrainKind;
  /** The room whose floor holds every cell. */
  room: number;
  /** The whole cells it fills; never a door cell, a stairwell, the row a stairwell is reached from or the cell before a door. */
  cells: CellPoint[];
  /** The i18n key of its name for the DM's label and the note (`dungeon.terrain.<kind>`), English the source. */
  name: string;
  traits: TerrainTraits;
  /**
   * The way it faces: down the steps of a platform or ledge, along a bridge, a low wall's
   * defended side, a statue's front, a channel's flow.
   */
  facing?: CellDir;
  /** A hole in this floor. */
  opening?: TerrainOpening;
  /** The floor under a hole above: the hole's `opening.link`. */
  under?: number;
  /** A bridge: the `id` of the chasm or channel it crosses (its cells lie on that piece's). */
  spans?: number;
  /** The cells of a platform or ledge its steps go up from: the easy way up. */
  steps?: CellPoint[];
}

/** The stages of a five-room dungeon, in the order a party meets them (Johnn Four's structure). */
export const FIVE_ROOM_STAGES = ['entrance', 'puzzle', 'setback', 'climax', 'reward'] as const;

export type FiveRoomStage = (typeof FIVE_ROOM_STAGES)[number];
