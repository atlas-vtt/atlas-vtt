/**
 * A floor's vegetation: what grows on its walls, columns and floor. It only dresses the dungeon;
 * where growth is thick enough to slow a party down it is terrain instead (brambles, thick ferns,
 * tangled roots: `TerrainKind`), so the rules of terrain hold for it. Never story: nothing here
 * is a herb to gather or a thing to fight.
 */

import type { CellPoint } from './model';

export type GrowthKind =
  // Climbers, on a wall's foot and over its top, or round a column.
  | 'ivy'
  | 'vine'
  | 'creeper'
  // Low growth that needs little light.
  | 'moss'
  | 'fungi'
  | 'roots'
  // Green growth that needs some.
  | 'grass'
  | 'fern';

export interface DungeonGrowth {
  kind: GrowthKind;
  /** The room it grows in. */
  room: number;
  /**
   * The floor cells it lies on or hangs over; never a door cell, the cell before a door, a
   * stairwell, the row a stairwell is reached from or a cell beside them.
   */
  cells: CellPoint[];
  /** Along a wall: the floor's edge at the wall's foot, in order, every quarter of a cell. */
  wall?: CellPoint[];
  /** Along a crack in the floor: the crack's line. */
  crack?: CellPoint[];
  /** Round a column: its index in the floor's `columns`. */
  column?: number;
  /** 0..1, how thickly it grows. */
  density: number;
}

export interface GrowthInfo {
  /** The i18n key of its name for the GM's label and the note. */
  name: string;
  /**
   * How high it stands, in the scene's heights (a wall is 1): what the shadows of what stands may
   * take from it. A climber stands as high as the wall it climbs, low growth hardly at all.
   */
  height: number;
  /** Green growth fades where no light reaches; the rest grows in the dark. */
  needsLight: boolean;
}

export const GROWTH_KINDS: Readonly<Record<GrowthKind, GrowthInfo>> = {
  ivy: { name: 'dungeon.growth.ivy', height: 1, needsLight: true },
  vine: { name: 'dungeon.growth.vine', height: 1, needsLight: true },
  creeper: { name: 'dungeon.growth.creeper', height: 1, needsLight: false },
  moss: { name: 'dungeon.growth.moss', height: 0.02, needsLight: false },
  fungi: { name: 'dungeon.growth.fungi', height: 0.06, needsLight: false },
  roots: { name: 'dungeon.growth.roots', height: 0.05, needsLight: false },
  grass: { name: 'dungeon.growth.grass', height: 0.08, needsLight: true },
  fern: { name: 'dungeon.growth.fern', height: 0.22, needsLight: true },
};
