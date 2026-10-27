import { flightSides, levelLinkList } from '../../levels/levelLinks';
import { hasLevels, resolveLevel, type SceneLevels } from '../../levels/sceneLevels';
import type { LevelLink } from '../../types/sceneLevelTypes';
import type { WallSegment } from '../../types/wallTypes';
import { movementWalls, moveWallsOf, type MapSize, type MoveWalls } from '../movement/index.ts';

/** What the sides of stairs read of the shared store. */
export interface StairsOfTokens {
  objects: { tokens: Record<string, { level?: string | undefined }>; levelLinks?: Record<string, LevelLink> | undefined };
  levels?: SceneLevels;
}

const NO_WALLS: WallSegment[] = [];
/** The sides of each level's walked stairs, by the links' record, the scene's levels, the level and the gap. */
const sidesByLinks = new WeakMap<object, WeakMap<object, Map<string, MoveWalls | null>>>();
/** Walls and stairs' sides as one, by the walls and the sides. */
const joined = new WeakMap<MoveWalls, WeakMap<MoveWalls, MoveWalls>>();

/**
 * The sides of walked stairs (`flightSides`) on the level a token stands on, as walls it stops at:
 * every edge but the one at that level's ground. Null where that level has none, or the scene has
 * no levels. A capsule as wide as the walls' on this map (`movementWalls`); the same object while
 * the stairs, the levels and the map's texel are the same.
 */
export function stairSides(state: StairsOfTokens, tokenId: string, map: MapSize | null): MoveWalls | null {
  const { levels } = state;
  const record = state.objects.levelLinks;
  const token = state.objects.tokens[tokenId];
  if (!hasLevels(levels) || record === undefined || token === undefined) return null;
  const level = resolveLevel(levels, token.level);
  if (level === null) return null;
  const { gap } = movementWalls(NO_WALLS, map);
  let byLevels = sidesByLinks.get(record);
  if (byLevels === undefined) sidesByLinks.set(record, (byLevels = new WeakMap<object, Map<string, MoveWalls | null>>()));
  let byLevel = byLevels.get(levels);
  if (byLevel === undefined) byLevels.set(levels, (byLevel = new Map<string, MoveWalls | null>()));
  const key = `${level}\n${gap}`;
  if (!byLevel.has(key)) {
    const sides = flightSides(levelLinkList(record), level, levels);
    byLevel.set(key, sides.length === 0 ? null : moveWallsOf(sides.map(([a, b]) => [a.x, a.y, b.x, b.y] as const), gap));
  }
  return byLevel.get(key) ?? null;
}

/** The walls and the sides of stairs a token stops at, as one (the walls' gap holds for both); either alone where the other is none. */
export function withStairSides(walls: MoveWalls | null, sides: MoveWalls | null): MoveWalls | null {
  if (sides === null) return walls;
  if (walls === null) return sides;
  let bySides = joined.get(walls);
  if (bySides === undefined) joined.set(walls, (bySides = new WeakMap<MoveWalls, MoveWalls>()));
  let both = bySides.get(sides);
  if (both === undefined) {
    const lines = new Float64Array(walls.lines.length + sides.lines.length);
    lines.set(walls.lines);
    lines.set(sides.lines, walls.lines.length);
    both = { lines, gap: walls.gap };
    bySides.set(sides, both);
  }
  return both;
}
