/**
 * Every floor's rooms, doors and stairwells, planned together in one cell grid. The entry floor
 * grows from its entrance at (0, 0); each next floor (below it in a Cavern, above it in a building:
 * the stack) grows from the end of the stairs that lead to it, and is grown anew until the stairs
 * between it and the floor before can stand (two where both have six rooms or more) and, unless it
 * is the last, a stairwell can lead on. A storey stands within the outer walls of the floor below
 * (`ground.ts`); where it cannot keep every rule there, its stairs are placed elsewhere and then the
 * floors under it are grown anew.
 */

import type { CellRect } from '../geometry';
import type { CaveFloor, CellDir, DungeonDoor, DungeonFloor, DungeonRoom, DungeonStair } from '../model';
import { type DungeonParams, floorParams } from '../params';
import { MAX_SEED, floorStream, int, pick } from '../rng';
import { type BuiltFloor, type FloorRequest, buildFloorLayout } from '../layout/assemble';
import type { CompactLayout } from '../layout/compact';
import { dir, floorRect } from '../geometry';
import type { CaveFloorPlan } from '../layout/cavern/caveGrid';
import { caveFits } from '../layout/cavern/caveFits';
import { type LaneEnd, clearOfLane, finalEnd } from '../layout/cavern/mainPath';
import { TWO_CONNECTIONS_FROM, type FloorShape, type PlacedStair, chooseOnward, extraConnection, normalRooms } from './connections';
import { type FloorStack, floorStack, isAbove, stairEnd } from './floorStack';
import type { ThemeDefinition } from '../themes/themeTypes';
import { type StoreyLanding, landingCells, landingFits, landingRoot } from './landing';
import { extentOf, footprintOf, isStorey, stairRoomFloor } from './ground';
import type { StairSpot } from './stairSpots';

/** Nothing but the first room may cover the ground before the entrance. */
const ENTRANCE_BLOCK: CellRect = { x0: -1, y0: -1, x1: 1, y1: 1 };
const AXES: readonly CellDir[] = [dir(0, 1), dir(1, 0), dir(0, -1), dir(-1, 0)];

export interface PlannedFloor {
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
  stairs: DungeonStair[];
  /** A Cavern floor's geology, written by `shapeCaves`, so the Cavern's facts read it from the floors assignment receives. */
  cave?: CaveFloor;
  /** A house's floor (`layout/house/`): walls on cell edges, its windows and chimney stacks, and on its entrance floor the grounds. */
  house?: Required<Pick<DungeonFloor, 'walls' | 'windows' | 'stacks'>> & Pick<DungeonFloor, 'grounds'>;
}

interface Link {
  /** Stairwells between the floor before and this one beyond the first. */
  extra: StairSpot[];
  /** Where the way on to the next floor stands; none on the last floor. */
  onward: PlacedStair | null;
}

/** The floors planned so far and the next stairwell's link. */
interface Progress {
  floors: PlannedFloor[];
  link: number;
}

/** Places tried for the stairs up to a storey, until one lets it keep every rule. */
const STOREY_STAIR_TRIES = 4;
/** How often a dungeon's floors may be grown anew so that the storey above can stand on them. */
const MOST_REGROWN = 6;
/** How often one storey has the floor below it grown anew before the floor under that one is. */
const REGROWN_PER_FLOOR = 2;

function stairsRng(seed: number, floor: number, key: string): () => number {
  return floorStream(seed, 'stairs', floor, key);
}

/**
 * The first stairwell on from floor `index` to the next, its `attempt`th place: from the entrance
 * room first where `fromEntrance`; where the next floor is a storey, only where its landing can
 * stand within this floor's outer walls; at least `across` cells wide.
 */
function onwardFrom(seed: number, floor: FloorShape, index: number, stack: FloorStack, fromEntrance: boolean, attempt = 0, across = 1): PlacedStair | null {
  const rng = stairsRng(seed, index, attempt === 0 ? 'descent' : `descent:${attempt}`);
  if (!isStorey(stack, index + 1)) return chooseOnward(rng, floor, index, stack, fromEntrance, undefined, across);
  const end = stairEnd(stack, index + 1, index);
  const ground = extentOf(floor, 0);
  return chooseOnward(rng, floor, index, stack, fromEntrance, (spot) => landingFits(spot, end, ground), across);
}

function withStairs(floor: { rooms: DungeonRoom[]; doors: DungeonDoor[] }, stairs: DungeonStair[]): PlannedFloor {
  return { rooms: floor.rooms, doors: floor.doors, stairs };
}

/** The two ends of a stairwell from floor `earlier` to the next: the earlier floor's, then the next floor's. */
function stairPair(spot: StairSpot, earlier: number, link: number): [DungeonStair, DungeonStair] {
  const rect = { x: spot.x, y: spot.y, w: spot.w, h: spot.h, down: spot.down };
  return [
    { ...rect, to: earlier + 1, link },
    { ...rect, to: earlier, link },
  ];
}

/**
 * The stairs a new floor `index` needs beyond the landing, given the floor before as planned so far:
 * a second stairwell where both are large enough, then whether a way leads on. Null where what is
 * needed cannot stand.
 */
function linkFloor(seed: number, earlier: FloorShape, later: FloorShape, index: number, last: boolean, stack: FloorStack, across: number, keepsLane: (spot: StairSpot) => boolean): Link | null {
  const extra: StairSpot[] = [];
  let before = earlier;
  let after = later;
  if (normalRooms(earlier) >= TWO_CONNECTIONS_FROM && normalRooms(later) >= TWO_CONNECTIONS_FROM) {
    const spot = extraConnection(stairsRng(seed, index, 'extra'), before, after, index - 1, stack, keepsLane);
    if (!spot) return null;
    extra.push(spot);
    before = { ...before, stairs: [...before.stairs, { ...spot, to: index }] };
    after = { ...after, stairs: [...after.stairs, { ...spot, to: index - 1 }] };
  }
  const onward = last ? null : onwardFrom(seed, after, index, stack, false, 0, across);
  if (!last && !onward) return null;
  return { extra, onward };
}

/**
 * Whether a cave floor can be shaped: a 3 × 3 block in every chamber, and its main path two cells
 * wide from where it is entered to its way down (`descent`), or on the last floor to its boss room
 * or farthest room. Always, for any other theme.
 */
function laneHolds(params: DungeonParams, floor: CaveFloorPlan, index: number, from: LaneEnd, descent: PlacedStair | null, boss: boolean): boolean {
  if (!params.cave) return true;
  if (!descent) return caveFits(floor, from, finalEnd(floor, from, boss), index);
  return caveFits({ ...floor, stairs: [...floor.stairs, { ...descent.spot, to: index + 1 }] }, from, { kind: 'stair', spot: descent.spot }, index);
}

/**
 * Floor `index`, grown from the `landing` end of the stairs from the floor before (the `passOver`th
 * that keeps every rule, for a floor grown anew): a storey within the floor below's outer walls
 * always, over the room the stairs rise from; a dug floor within its footprint where it can keep
 * every rule there, else wherever it can.
 */
function nextFloor(seed: number, params: DungeonParams, earlier: FloorShape, index: number, last: boolean, landing: DungeonStair, boss: boolean, stack: FloorStack, passOver: number): BuiltFloor | null {
  const end = stairEnd(stack, index, index - 1);
  const within = footprintOf(earlier, index, stack);
  const storey: StoreyLanding | null = isStorey(stack, index) ? { over: stairRoomFloor(earlier, landing), ground: within, small: index > 1 } : null;
  const keepsLane = params.cave ? clearOfLane(earlier, index - 1) : (): boolean => true;
  const request: FloorRequest = {
    floor: index,
    params: floorParams(params, index, stack.rise),
    rootOf: (rng) => landingRoot(rng, landing, end, storey, params.minRoomFloor),
    reserved: null,
    within,
    boss: boss && last,
    // A boss room that lies under a room of the floor above counts larger, so a gallery can look into it.
    galleries: isAbove(stack, index - 1, index) ? earlier.rooms.filter((room) => room.kind === 'room' && room.wing === 'regular' && !room.rotunda).map(floorRect) : [],
    blocked: landingCells(landing, end),
    accept: (built) => {
      const link = linkFloor(seed, earlier, { ...built, stairs: [landing] }, index, last, stack, params.stairAcross ?? 1, keepsLane);
      const stairs = [landing, ...(link?.extra ?? []).map((spot) => ({ ...spot, to: index - 1 }))];
      return link !== null && laneHolds(params, { ...built, stairs }, index, { kind: 'stair', spot: landing }, link.onward, boss && last);
    },
    passOver,
  };
  const inside = buildFloorLayout(seed, request);
  if (inside?.sound || storey) return inside;
  return buildFloorLayout(seed, { ...request, within: null }) ?? inside;
}

interface NextFloor {
  layout: CompactLayout;
  sound: boolean;
  /** The stairwell's end on the floor before, and on this one. */
  from: DungeonStair;
  landing: DungeonStair;
}

/**
 * Floor `index` and stairwell `link` to it from the floor before. A storey tries other places for
 * its stairs until one lets it keep every rule, else takes the first it found.
 */
function nextAcross(seed: number, params: DungeonParams, earlier: PlannedFloor, index: number, last: boolean, boss: boolean, stack: FloorStack, link: number, fromEntrance: boolean, passOver: number): NextFloor | null {
  let first: NextFloor | null = null;
  const tries = isStorey(stack, index) ? STOREY_STAIR_TRIES : 1;
  for (let attempt = 0; attempt < tries; attempt++) {
    const onward = onwardFrom(seed, earlier, index - 1, stack, fromEntrance, attempt, params.stairAcross ?? 1);
    if (!onward) break;
    const [from, landing] = stairPair(onward.spot, index - 1, link);
    const built = nextFloor(seed, params, { ...earlier, stairs: [...earlier.stairs, from] }, index, last, landing, boss, stack, passOver);
    const next = built && { layout: built.layout, sound: built.sound, from, landing };
    if (next?.sound) return next;
    first ??= next;
  }
  return first;
}

/** What a theme says of how its floors are planned: which way they stack, whether the stairs up rise from the entrance room, and how deep that room is at least. */
export type FloorPlanning = Pick<ThemeDefinition, 'rise' | 'stairsFromEntrance' | 'entranceDepth'>;

/**
 * Every floor, in order from the entrance floor, each next one lying the way `planning.rise` says;
 * a five-room dungeon (`fiveRoom`) is one floor of five main rooms.
 */
export function planFloors(seed: number, params: DungeonParams, count: number, boss: boolean, fiveRoom = false, planning: FloorPlanning = { rise: 'down' }): PlannedFloor[] {
  const { rise } = planning;
  const stack = floorStack(rise, count);
  const fromEntrance = planning.stairsFromEntrance === true;
  const across = params.stairAcross ?? 1;
  const entryFloor = (passOver: number): PlannedFloor => {
    const entry = buildFloorLayout(seed, {
      floor: 0,
      params: floorParams(params, 0, rise),
      rootOf: (rng) => ({ origin: { x: 0, y: 0 }, axis: pick(rng, AXES), seed: int(rng, 1, MAX_SEED), ...(planning.entranceDepth !== undefined && { minDepth: planning.entranceDepth }) }),
      reserved: ENTRANCE_BLOCK,
      within: null,
      boss: boss && count === 1,
      fiveRoom: fiveRoom && count === 1,
      blocked: new Set(),
      accept: (layout) => {
        const onward = count === 1 ? null : onwardFrom(seed, { ...layout, stairs: [] }, 0, stack, fromEntrance, 0, across);
        return (count === 1 || onward !== null) && laneHolds(params, { ...layout, stairs: [] }, 0, { kind: 'entrance' }, onward, boss && count === 1);
      },
      passOver,
    });
    if (!entry) throw new Error('no dungeon layout');
    return withStairs(entry.layout, []);
  };
  let floors: PlannedFloor[] = [entryFloor(0)];
  let link = 0;
  // The floors and links as they stood before each floor was added, and how many sound layouts each floor passes over.
  const before: Progress[] = [];
  const passOver = new Map<number, number>();
  let regrown = 0;
  const failsAt = new Map<number, number>();
  for (let index = 1; index < count; index++) {
    before[index] = { floors: [...floors], link };
    const earlier = floors[index - 1] as PlannedFloor;
    const last = index === count - 1;
    const next = nextAcross(seed, params, earlier, index, last, boss, stack, link++, index === 1 && fromEntrance, passOver.get(index) ?? 0);
    if (!next) break;
    if (!next.sound && isStorey(stack, index) && regrown < MOST_REGROWN) {
      // A storey that cannot keep every rule on the floor below has that floor grown anew, and then the one under it.
      regrown += 1;
      const fails = (failsAt.get(index) ?? 0) + 1;
      failsAt.set(index, fails);
      const below = Math.max(0, index - 1 - Math.floor((fails - 1) / REGROWN_PER_FLOOR));
      passOver.set(below, (passOver.get(below) ?? 0) + 1);
      for (const later of [...passOver.keys()]) if (later > below) passOver.delete(later);
      ({ floors, link } = below === 0 ? { floors: [entryFloor(passOver.get(0) ?? 0)], link: 0 } : (before[below] as Progress));
      index = Math.max(below, 1) - 1;
      continue;
    }
    const { layout, from, landing } = next;
    const earlierWithStairs = { ...earlier, stairs: [...earlier.stairs, from] };
    const keepsLane = params.cave ? clearOfLane(earlierWithStairs, index - 1) : (): boolean => true;
    const extra = linkFloor(seed, earlierWithStairs, { ...layout, stairs: [landing] }, index, last, stack, across, keepsLane)?.extra ?? [];
    const pairs = extra.map((spot) => stairPair(spot, index - 1, link++));
    floors[index - 1] = { ...earlier, stairs: [...earlierWithStairs.stairs, ...pairs.map(([e]) => e)] };
    floors.push(withStairs(layout, [landing, ...pairs.map(([, l]) => l)]));
  }
  return floors;
}
