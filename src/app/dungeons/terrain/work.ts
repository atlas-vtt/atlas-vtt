/** What every terrain pass shares: the floors being placed, the tags, the theme, the links of holes, the streams. */

import type { FloorStack } from '../floors/floorStack';
import type { CaveSites } from '../layout/cavern/caveSites';
import type { CaveVariant } from '../model';
import { type Rng, floorStream } from '../rng';
import type { DungeonTag } from '../tags';
import type { ThemeContext } from '../themes/themes';
import type { FloorTerrain } from './floorTerrain';
import type { TypedRoom } from './typeTerrain';

export interface TerrainWork {
  floors: readonly FloorTerrain[];
  /** Which floor lies over which: holes fall to the floor physically below. */
  stack: FloorStack;
  tags: ReadonlySet<DungeonTag>;
  theme: ThemeContext;
  /** A room's type and its recipe's reading, where the theme typed it. */
  typed: (floor: number, room: number) => TypedRoom | undefined;
  /** Whether a typed room stands empty. */
  empty: (floor: number, room: number) => boolean;
  /** A new id shared by the holes of one shaft or abyss and the floor under it. */
  nextLink: () => number;
  /** The terrain stream of a floor, split by `key`. */
  rng: (floor: number, key: string) => Rng;
  /** The stream a floor's pieces (statues, fireplaces, formations) are placed from, split by `key`: its own, so the pieces drawn never move terrain. */
  furnishRng: (floor: number, key: string) => Rng;
  /** A Cavern's geology: what each floor knows of its rooms, and its variant. */
  cave?: TerrainCave;
}

export interface TerrainCave {
  sites: readonly CaveSites[];
  variant: CaveVariant;
}

/** What the theme typed: each floor's typed rooms and the rooms that stand empty. */
export interface TerrainTypes {
  types: readonly (ReadonlyMap<number, TypedRoom> | undefined)[];
  empty: readonly ReadonlySet<number>[];
}

export function terrainWork(seed: number, floors: readonly FloorTerrain[], stack: FloorStack, tags: ReadonlySet<DungeonTag>, theme: ThemeContext, typed: TerrainTypes, cave?: TerrainCave): TerrainWork {
  let link = 0;
  return {
    ...(cave && { cave }),
    floors,
    stack,
    tags,
    theme,
    typed: (floor, room) => typed.types[floor]?.get(room),
    empty: (floor, room) => typed.empty[floor]?.has(room) === true,
    nextLink: () => link++,
    rng: (floor, key) => floorStream(seed, 'terrain', floor, key),
    furnishRng: (floor, key) => floorStream(seed, 'furnish', floor, key),
  };
}
