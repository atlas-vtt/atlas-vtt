import type { DoorKind } from '../model';
import type { DungeonParams, SizeStyle } from '../params';
import { type Rng, chance, int, pick, weighted } from '../rng';
import { type ChamberTier, type TierDraw, drawTier, tierSize } from './cavern/veins/caveSizes';
import { ROUTE_WALLS, routeSegments, routeTurns } from './cavern/veins/routeLength';
import type { PassageKind } from './workLayout';

export interface RoomSize {
  /** Walls included, odd. */
  width: number;
  /** Walls included, from the door row to the far wall. */
  depth: number;
  /** A passage wider than a cell: its kind. */
  passage?: PassageKind;
  /** A cave chamber's size tier, where the size was drawn by tier. */
  tier?: ChamberTier;
  /** A cave passage that is the first of a long way: the cells of floor of each passage still to lay after it. */
  route?: number[];
}

/** A cave passage of a way, `cells` of floor long. */
export function routePassage(cells: number): RoomSize {
  return { width: 3, depth: cells + ROUTE_WALLS };
}

/** A cave passage as long as its way's first stretch, and the stretches still to lay after it. */
function drawRoute(rng: Rng): RoomSize {
  const [first, ...rest] = routeSegments(routeTurns(rng));
  return { ...routePassage(first!), ...(rest.length > 0 && { route: rest }) };
}

function sizeOfStyle(rng: Rng, style: SizeStyle): RoomSize {
  switch (style) {
    case 0:
      return { width: pick(rng, [5, 7]), depth: int(rng, 4, 6) };
    case 1:
      return { width: pick(rng, [5, 7, 9]), depth: int(rng, 7, 9) };
    case 2:
      return { width: 3, depth: int(rng, 4, 5) };
    case 3:
      return { width: 3, depth: 3 };
  }
}

/** A normal room's size grown to a floor of `minFloor` cells each way; the walls count twice. */
function atLeast(size: RoomSize, minFloor: number): RoomSize {
  const least = minFloor + 2;
  return size.width >= least && size.depth >= least ? size : { width: Math.max(size.width, least + ((least + 1) % 2)), depth: Math.max(size.depth, least) };
}

/** A corridor or junction as wide as `floor` cells across (a junction as deep), a corridor `depth` deep as drawn. */
function widePassage(depth: number, style: SizeStyle, floor: number): RoomSize {
  const width = floor + 2;
  return style === 3 ? { width, depth: width, passage: 'junction' } : { width, depth, passage: 'corridor' };
}

/**
 * A new room's size; with `round`, half of the rooms come out square so they may be round. A
 * normal room grows to `minRoomFloor` after the draw, and a passage to `passageFloor`, so the rolls
 * stay as they were. In a Cavern with the book's rules a chamber is drawn at a size tier (`cave`
 * says what its floor allows, and whether the room must be a chamber) and a corridor runs as long
 * as its way takes, the first of a chain where the way is long (`route`).
 */
export function drawSize(rng: Rng, params: DungeonParams, cave: TierDraw = { gargantuan: false }): RoomSize {
  const style = pick(rng, params.sizeStyles);
  const veins = params.cave?.veins;
  if (veins && (style <= 1 || cave.chamber)) {
    const tier = drawTier(rng, veins.tiers, cave);
    const size = tierSize(rng, tier);
    // A round cave's chambers come out square half the time, as long as they are wide: every tier's floor allows it.
    return { ...size, ...(params.squareRooms && chance(rng, 0.5) && { depth: size.width }), tier };
  }
  const drawn = veins && style === 2 ? drawRoute(rng) : sizeOfStyle(rng, style);
  if (style >= 2) return params.passageFloor ? widePassage(drawn.depth, style, params.passageFloor) : drawn;
  const size = params.squareRooms && chance(rng, 0.5) ? { width: drawn.width, depth: drawn.width } : drawn;
  return params.minRoomFloor ? atLeast(size, params.minRoomFloor) : size;
}

/** A normal room's size, small or large but never a corridor: the room around a landing. */
export function drawRoomSize(rng: Rng, minFloor = 0): RoomSize {
  const size = sizeOfStyle(rng, pick<SizeStyle>(rng, [0, 0, 1]));
  return minFloor ? atLeast(size, minFloor) : size;
}

/** A small room's size: a storey's stair landing. */
export function drawSmallRoomSize(rng: Rng): RoomSize {
  return sizeOfStyle(rng, 0);
}

/** Ordinary doors: a door about three times in five, else an opening. */
const DOOR_WEIGHTS: readonly (readonly [DoorKind, number])[] = [
  ['door', 0.6],
  ['opening', 0.4],
];

/** The kind of a door between two rooms; corridors open into each other. */
export function drawDoorKind(rng: Rng, betweenCorridors: boolean): DoorKind {
  const kind = weighted(rng, DOOR_WEIGHTS);
  return betweenCorridors ? 'opening' : kind;
}
