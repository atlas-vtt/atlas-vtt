/**
 * The game board's rule of cover, written apart from the generator: every room that can hold a
 * fight has cover. Such a room is a normal room with at least `FIGHT_AREA` cells of floor that are
 * no stairwell and some free floor off the ways between its doors and stairs, is no boss arena (which
 * keeps its own cover) and holds no hazard (a chasm hall, a lake, a ruin's collapsed floor: what
 * lies there is the fight).
 * Empty rooms count too: cover is structure, not furnishing. A theme that shows architecture alone
 * (`ThemeDefinition.architectureOnly`, the Haunted Mansion) keeps the opposite rule: no cover but
 * what its rooms' types place.
 */

import { stackOf, stairEnd } from '../../../src/app/dungeons/floors/floorStack';
import { cellKey, cellsOf, floorCellsOf } from '../../../src/app/dungeons/geometry';
import { spotRect } from '../../../src/app/dungeons/floors/stairSpots';
import type { DungeonModel, DungeonRoom, TerrainKind } from '../../../src/app/dungeons/model';
import { FIGHT_AREA } from '../../../src/app/dungeons/terrain/cover';
import { programmeOf, themeOf } from '../../../src/app/dungeons/themes/themes';
import type { DungeonTag } from '../../../src/app/dungeons/tags';
import { RoomCells } from '../../../src/app/dungeons/terrain/roomCells';
import { reserveLanes } from '../../../src/app/dungeons/terrain/roomLanes';
import { normals } from './dungeonInvariants';
import { hasCover, isHazard } from './terrainInvariants';

/** What is laid after a room's cover (water, undergrowth, a cave's floor), so it never takes cover's place. */
const AFTER_COVER: ReadonlySet<string> = new Set(['shallow-water', 'brambles', 'thicket', 'tangled-roots', 'guano', 'bone-litter', 'sulphur-crust', 'rimstone']);
/** A ruin's decay, laid after the cover of its rooms; the same ground of a cave's breakdown or a five-room setback comes before it. */
const DECAY: ReadonlySet<string> = new Set(['rubble-field', 'broken-floor']);

/** Whether a room has floor to make a stand on: free of every way between its doors and stairs and of what stood there before its cover. A crossing has none. */
export function standsOffWays(model: DungeonModel, f: number, room: DungeonRoom, rc: RoomCells): boolean {
  const floor = model.floors[f]!;
  reserveLanes(rc);
  const decayed = model.tags.includes('ruined') && model.theme !== 'cavern' && !room.stage;
  const after = (kind: string): boolean => AFTER_COVER.has(kind) || (decayed && DECAY.has(kind));
  const before = new Set(floor.terrain.filter((p) => p.room === room.id && !after(p.kind)).flatMap((p) => p.cells.map((c) => cellKey(c.x, c.y))));
  return floorCellsOf(room).some((c) => rc.offWays(c) && !before.has(cellKey(c.x, c.y)));
}

/** A room's cells as the generator reads them. */
export function roomCellsOf(model: DungeonModel, f: number, room: DungeonRoom): RoomCells {
  const floor = model.floors[f]!;
  const lane = new Set((floor.cave?.lane ?? []).map((c) => cellKey(c.x, c.y)));
  return new RoomCells(room, floor.doors, floor.stairs, (s) => stairEnd(stackOf(model), f, s.to), floor.columns, lane);
}

/** The rooms of a dungeon that can hold a fight and have no cover, one line each. */
export function uncoveredFightRooms(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => normals(floor)
    .filter((room) => !room.boss && room.type !== 'collapsed-room' && !floor.terrain.some((p) => p.room === room.id && isHazard(p)))
    .filter((room) => {
      const rc = roomCellsOf(model, f, room);
      const stairs = floor.stairs.flatMap((s) => cellsOf(spotRect(s))).filter((c) => rc.isFloor(c)).length;
      return rc.floorCount - stairs >= FIGHT_AREA && standsOffWays(model, f, room, rc);
    })
    .filter((room) => !hasCover(floor, room.id))
    .map((room) => `floor ${f}: ${room.type ?? 'room'} ${room.id} (${room.w}×${room.h}) has no cover`));
}

/** The pieces the rule of cover places where a room has none: fallen stone, low walls, pillars and statues. */
const COVER_PIECES: ReadonlySet<TerrainKind> = new Set<TerrainKind>(['rubble-heap', 'low-wall', 'pillar', 'statue']);

/**
 * The cover pieces of a theme that shows architecture alone and that no reason of the room placed,
 * one line each: a boss arena and a five-room stage keep their own, a type that allows a kind may
 * have it, and a ruin may have fallen stone.
 */
function unreasonedCover(model: DungeonModel): string[] {
  const programme = programmeOf(themeOf(model.theme), new Set(model.tags as DungeonTag[]));
  const allowed = new Map(programme.rooms.map((spec) => [spec.id as string, new Set<string>(spec.terrain.allows ?? [])]));
  const ruined = model.tags.includes('ruined');
  return model.floors.flatMap((floor, f) => floor.terrain.flatMap((p) => {
    const room = floor.rooms[p.room];
    if (!COVER_PIECES.has(p.kind) || !room || room.boss || room.stage || (ruined && p.kind === 'rubble-heap')) return [];
    return allowed.get(room.type ?? '')?.has(p.kind) ? [] : [`floor ${f}: ${p.kind} in ${room.type ?? 'room'} ${p.room}`];
  }));
}

/** The rule of cover the dungeon's theme keeps: cover in every room that can hold a fight, or, where the theme shows architecture alone, none its rooms do not place. */
export function coverProblems(model: DungeonModel): string[] {
  return themeOf(model.theme).architectureOnly ? unreasonedCover(model) : uncoveredFightRooms(model);
}
