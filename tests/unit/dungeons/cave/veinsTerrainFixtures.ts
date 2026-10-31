import { caveSites } from '../../../../src/app/dungeons/layout/cavern/caveSites';
import { floorStack } from '../../../../src/app/dungeons/floors/floorStack';
import { cellsOf } from '../../../../src/app/dungeons/geometry';
import type { CaveCharacter, CaveFloor, CaveVerticalExits, CaveWay, CellPoint, DungeonDoor, DungeonFloor, DungeonRoom, DungeonStair, VerticalWay } from '../../../../src/app/dungeons/model';
import { readTags } from '../../../../src/app/dungeons/tags';
import { ALL_TERRAIN_KINDS } from '../../../../src/app/dungeons/terrain/catalog';
import { type FloorPlan, FloorTerrain } from '../../../../src/app/dungeons/terrain/floorTerrain';
import { type TerrainWork, terrainWork } from '../../../../src/app/dungeons/terrain/work';
import { NO_FACTS, themeOf } from '../../../../src/app/dungeons/themes/themes';
import { room } from '../plannedFloorFixtures';

/**
 * Cave floors built by hand for the ground of a cave's ways: chamber A (cells 1..6 × 1..6), a
 * passage two cells wide (8..13 × 3..4) and chamber B (15..20 × 1..6), joined by doors at (7, 3)
 * and (14, 3), the way in to A's west at (0, 3). Without the passage, B (room 1, 8..13 × 1..6)
 * lies right beyond A's door. The way of the door from A into the passage, the
 * lane's cells and A's exits in roof and floor are the test's.
 */

export interface HandCave {
  work: TerrainWork;
  floors: FloorTerrain[];
  plans: FloorPlan[];
}

export interface HandCaveOptions {
  way?: CaveWay;
  /** The door from A into the passage joins A to B directly instead: no passage between. */
  noPassage?: boolean;
  lane?: CellPoint[];
  vertical?: DungeonRoom['vertical'];
  /** A second floor below, a chamber under all of A. */
  below?: boolean;
  tags?: string[];
  character?: CaveCharacter;
  /** Chambers west and east of A instead of the passage, each joined to A by a sump way at mirrored places; the way in from the north. */
  twinSumps?: boolean;
  /** A pitch down from A's south-east corner (cells (4, 5) and (5, 5)) to the floor below, which `below` adds. */
  pitch?: boolean;
}

const square = (x0: number, y0: number, x1: number, y1: number): CellPoint[] => cellsOf({ x0, y0, x1, y1 });

/** The pitch's end on a floor, leading to floor `to`. */
const pitchEnd = (to: number): DungeonStair => ({ x: 4, y: 5, w: 2, h: 1, down: { x: 1, y: 0 }, to, link: 1, way: 'pitch' });

/** The passage's cells. */
export const PASSAGE = square(8, 3, 13, 4);
/** Chamber A's cells. */
export const CHAMBER_A = square(1, 1, 6, 6);

function caveFloor(lane: CellPoint[]): CaveFloor {
  return { lane, heights: [0, 0, 0], faults: [], basins: [], streams: [], dams: [] };
}

function topFloor(options: HandCaveOptions): FloorPlan {
  const a: DungeonRoom = { ...room(0, { x: 0, y: 0, w: 8, h: 8, axis: { x: 1, y: 0 } }), cells: CHAMBER_A, ...(options.vertical && { vertical: options.vertical }) };
  const way = options.way ? { way: options.way } : {};
  const entrance: DungeonDoor = { x: 0, y: 3, dir: { x: 1, y: 0 }, kind: 'opening', from: null, to: 0 };
  if (options.twinSumps) {
    const west: DungeonRoom = { ...room(1, { x: -7, y: 0, w: 8, h: 8, axis: { x: -1, y: 0 } }), cells: square(-6, 1, -1, 6) };
    const east: DungeonRoom = { ...room(2, { x: 7, y: 0, w: 8, h: 8, axis: { x: 1, y: 0 } }), cells: square(8, 1, 13, 6) };
    const doors: DungeonDoor[] = [
      { x: 3, y: 0, dir: { x: 0, y: 1 }, kind: 'opening', from: null, to: 0 },
      { x: 0, y: 3, dir: { x: 1, y: 0 }, kind: 'opening', from: 1, to: 0, way: 'sump' },
      { x: 7, y: 3, dir: { x: -1, y: 0 }, kind: 'opening', from: 2, to: 0, way: 'sump' },
    ];
    return { rooms: [a, west, east], doors, stairs: [], columns: [], offeredTerrain: ALL_TERRAIN_KINDS, cave: caveFloor(options.lane ?? []) };
  }
  if (options.noPassage) {
    const b: DungeonRoom = { ...room(1, { x: 7, y: 0, w: 8, h: 8, axis: { x: 1, y: 0 } }), cells: square(8, 1, 13, 6) };
    const doors: DungeonDoor[] = [entrance, { x: 7, y: 3, dir: { x: 1, y: 0 }, kind: 'opening', from: 0, to: 1, ...way }];
    return { rooms: [a, b], doors, stairs: [], columns: [], offeredTerrain: ALL_TERRAIN_KINDS, cave: caveFloor(options.lane ?? []) };
  }
  const passage: DungeonRoom = { ...room(1, { x: 7, y: 2, w: 8, h: 4, kind: 'corridor', axis: { x: 1, y: 0 } }), cells: PASSAGE };
  const b: DungeonRoom = { ...room(2, { x: 14, y: 0, w: 8, h: 8, axis: { x: 1, y: 0 } }), cells: square(15, 1, 20, 6) };
  const doors: DungeonDoor[] = [
    entrance,
    { x: 7, y: 3, dir: { x: 1, y: 0 }, kind: 'opening', from: 0, to: 1, ...way },
    { x: 14, y: 3, dir: { x: 1, y: 0 }, kind: 'opening', from: 1, to: 2, way: 'walk' },
  ];
  return { rooms: [a, passage, b], doors, stairs: options.pitch ? [pitchEnd(1)] : [], columns: [], offeredTerrain: ALL_TERRAIN_KINDS, cave: caveFloor(options.lane ?? []) };
}

function lowerFloor(options: HandCaveOptions): FloorPlan {
  const under: DungeonRoom = { ...room(0, { x: -1, y: -1, w: 10, h: 10, axis: { x: 1, y: 0 } }), cells: square(0, 0, 7, 7) };
  return { rooms: [under], doors: [], stairs: options.pitch ? [pitchEnd(0)] : [], columns: [], offeredTerrain: ALL_TERRAIN_KINDS, cave: caveFloor([]) };
}

/** A chamber's roof and floor exits by their widths, each as deep as ten times its width in feet, so a test can tell them apart. */
export function waysOf(up: readonly number[], down: readonly number[]): CaveVerticalExits {
  const ways = (widths: readonly number[]): VerticalWay[] => widths.map((width) => ({ width, depth: width * 10 }));
  return { up: ways(up), down: ways(down) };
}

/** The hand-built cave, ready for a terrain pass on floor 0. */
export function handCave(options: HandCaveOptions = {}, seed = 1): HandCave {
  const plans = [topFloor(options), ...(options.below ? [lowerFloor(options)] : [])];
  const stack = floorStack('down', plans.length);
  const floors = plans.map((plan, index) => new FloorTerrain(index, plan, stack));
  const sites = caveSites(plans.map((plan) => ({ rooms: [...plan.rooms], doors: [...plan.doors], stairs: [...plan.stairs], ...(plan.cave && { cave: plan.cave }) })));
  const theme = { definition: themeOf('cavern'), ruined: false, facts: NO_FACTS };
  const types = { types: plans.map(() => new Map()), empty: plans.map(() => new Set<number>()) };
  const cave = { sites, variant: 'limestone' as const, ...(options.character && { character: options.character }) };
  const work = terrainWork(seed, floors, stack, new Set(readTags(options.tags ?? [])), theme, types, cave);
  return { work, floors, plans };
}

/** The finished floor as the invariants read it. */
export function asFloor(floor: FloorTerrain): DungeonFloor {
  const { rooms, doors, stairs, columns, cave } = floor.plan;
  return { rooms: [...rooms], doors: [...doors], stairs: [...stairs], columns: [...columns], props: [], rubble: [], cracks: [], water: [], waterCells: [], terrain: floor.pieces, growth: [], ...(cave && { cave }) };
}
