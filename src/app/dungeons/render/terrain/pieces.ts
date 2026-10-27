import type { CellDir, CellPoint, DungeonTerrain, TerrainKind } from '../../model';
import { floorBelow, stackOf } from '../../floors/floorStack';
import { HOLE_KINDS } from '../../terrain/catalog';
import type { Rng } from '../../rng';
import type { RenderEnv } from '../renderEnv';
import type { Vec } from '../geometry';

/** The pieces of the floor in rooms the view shows, of `kinds` where given. */
export function shownPieces(env: RenderEnv, kinds?: ReadonlySet<TerrainKind>): DungeonTerrain[] {
  const { dungeon } = env;
  return dungeon.floor.terrain.filter(piece => dungeon.roomShapes.has(piece.room) && (!kinds || kinds.has(piece.kind)));
}

/** A small seeded stream per piece, so a piece's details never move when another changes. */
export function pieceRng(env: RenderEnv, piece: DungeonTerrain, part = ''): Rng {
  return env.rng(`terrain:${piece.id}${part}`);
}

/** The axis of the piece's room: the way it was entered. */
export function roomAxis(env: RenderEnv, piece: DungeonTerrain): CellDir {
  return env.dungeon.floor.rooms[piece.room]?.axis ?? { x: 0, y: 1 };
}

/** Whether a piece is a hole in its floor (a chasm, shaft or gallery that opens onto something). */
export function isHole(piece: DungeonTerrain): boolean {
  return piece.opening !== undefined && HOLE_KINDS.has(piece.kind);
}

export function cellSet(cells: readonly CellPoint[]): Set<string> {
  return new Set(cells.map(c => `${c.x},${c.y}`));
}

/** Whether a cell is open floor of the room the view shows (not wall, not past the map). */
export function onFloor(env: RenderEnv, c: CellPoint): boolean {
  return env.dungeon.field.distance(c.x + 0.5, c.y + 0.5) < 0;
}

/** How far past its radius a stone's outline may reach. */
const STONE_REACH = 1.3;

/**
 * Whether a loose stone of radius `r` at `c` lies clear of a cave's drawn wall. A cave's wall
 * wanders into the cells beside it, and a stone drawn over it would hide the wall's ink.
 */
export function clearOfCaveWall(env: RenderEnv, c: Vec, r: number): boolean {
  return env.dungeon.floor.cave === undefined || env.dungeon.field.distance(c.x, c.y) < -STONE_REACH * r;
}

/** Whether holes on this floor are cut out of the picture: a floor lies below and the picture is not to stand alone. */
export function cutsHoles(env: RenderEnv): boolean {
  return env.openings === 'cut' && hasFloorBelow(env);
}

/** Whether a floor lies physically below the one shown. */
export function hasFloorBelow(env: RenderEnv): boolean {
  return floorBelow(stackOf(env.dungeon.model), env.dungeon.index) !== null;
}
