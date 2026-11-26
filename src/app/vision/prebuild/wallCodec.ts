import type { LevelSet } from '../../types/sceneLevelTypes';
import type { WallSegment } from '../../types/wallTypes';

/**
 * Walls packed for a worker: numbers in typed arrays and the ids in one string, so handing
 * thousands of walls over costs a copy of a few buffers instead of a structured clone of every
 * object (18 ms on the main thread for 6,880 walls). Every field a wall has (`WallSegment`) is
 * carried; a wall whose field holds a value it cannot carry makes the whole list uncarriable.
 */
export interface PackedWalls {
  /** `p1.x, p1.y, p2.x, p2.y` of each wall. */
  coords: Float64Array;
  /** Each wall's enumerated fields, `FIELD_BITS` apart. */
  codes: Uint16Array;
  ids: string;
  /** The chain ids of the walls that have one (`HAS_CHAIN`), in their order. */
  chains: string;
  /** The level sets of the walls that have one: wall index and set. */
  levels: [number, LevelSet][];
}

const SEPARATOR = '\u0000';
const TYPES = ['solid', 'door', 'secret-door'] as const;
const DIRECTIONS = [undefined, 'left', 'right'] as const;
const FLAGS = [undefined, true, false] as const;
const BLOCKS = [undefined, 'sight', 'light', 'movement'] as const;
const FLOORS = [undefined, 'left', 'right'] as const;
/** Where each enumerated field sits in a code (two bits each), and its values in order. */
const FIELDS = [
  ['type', TYPES, 0],
  ['direction', DIRECTIONS, 2],
  ['closed', FLAGS, 4],
  ['locked', FLAGS, 6],
  ['blocks', BLOCKS, 8],
  ['limited', FLAGS, 10],
  ['floor', FLOORS, 12],
] as const;
const HAS_CHAIN = 1 << 15;

/** `walls` packed, or null where a wall holds a value no field can carry (a later version's, a hand edit). */
export function packWalls(walls: readonly WallSegment[]): PackedWalls | null {
  const coords = new Float64Array(walls.length * 4);
  const codes = new Uint16Array(walls.length);
  const ids: string[] = [];
  const chains: string[] = [];
  const levels: [number, LevelSet][] = [];
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i]!;
    if (typeof wall.id !== 'string' || wall.id.includes(SEPARATOR)) return null;
    let code = 0;
    for (const [field, values, shift] of FIELDS) {
      const at = (values as readonly unknown[]).indexOf(wall[field]);
      if (at < 0) return null;
      code |= at << shift;
    }
    if (wall.chainId !== undefined) {
      if (typeof wall.chainId !== 'string' || wall.chainId.includes(SEPARATOR)) return null;
      code |= HAS_CHAIN;
      chains.push(wall.chainId);
    }
    if (wall.levels !== undefined) levels.push([i, wall.levels]);
    codes[i] = code;
    coords[4 * i] = wall.p1.x;
    coords[4 * i + 1] = wall.p1.y;
    coords[4 * i + 2] = wall.p2.x;
    coords[4 * i + 3] = wall.p2.y;
    ids.push(wall.id);
  }
  return { coords, codes, ids: ids.join(SEPARATOR), chains: chains.join(SEPARATOR), levels };
}

/** The walls `packed` holds, with every field they had that is set. */
export function unpackWalls({ coords, codes, ids, chains, levels }: PackedWalls): WallSegment[] {
  const idList = codes.length > 0 ? ids.split(SEPARATOR) : [];
  const chainList = chains.split(SEPARATOR);
  const levelsOf = new Map(levels);
  let chain = 0;
  const walls: WallSegment[] = [];
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    const wall: WallSegment = {
      id: idList[i]!,
      kind: 'wall',
      type: TYPES[code & 3]!,
      p1: { x: coords[4 * i]!, y: coords[4 * i + 1]! },
      p2: { x: coords[4 * i + 2]!, y: coords[4 * i + 3]! },
    };
    const direction = DIRECTIONS[(code >> 2) & 3];
    const closed = FLAGS[(code >> 4) & 3];
    const locked = FLAGS[(code >> 6) & 3];
    const blocks = BLOCKS[(code >> 8) & 3];
    const limited = FLAGS[(code >> 10) & 3];
    const floor = FLOORS[(code >> 12) & 3];
    if (direction !== undefined) wall.direction = direction;
    if (closed !== undefined) wall.closed = closed;
    if (locked !== undefined) wall.locked = locked;
    if (blocks !== undefined) wall.blocks = blocks;
    if (limited !== undefined) wall.limited = limited;
    if (floor !== undefined) wall.floor = floor;
    if (code & HAS_CHAIN) wall.chainId = chainList[chain++]!;
    const set = levelsOf.get(i);
    if (set !== undefined) wall.levels = set;
    walls.push(wall);
  }
  return walls;
}
