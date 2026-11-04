/**
 * A Cavern's floors shaped from their planned rooms: per floor the main path's lane, every
 * chamber grown and smoothed, every tunnel chiselled, every door a narrows, the token-fit guards
 * repaired; the cells written onto the rooms, the lane and fault lines onto the floor.
 */

import type { FloorStack } from '../../floors/floorStack';
import type { PlannedFloor } from '../../floors/planFloors';
import { cellKey } from '../../geometry';
import type { CaveFloor, CaveModel, CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import type { DungeonParams } from '../../params';
import { floorStream, stream } from '../../rng';
import { CaveGrid } from './caveGrid';
import type { CaveShaping } from './caveParams';
import { swellChamber, widenNoise, widenTunnel } from './bulges';
import type { ChamberField } from './chamberField';
import { chamberSeeds, growChamber, reserveCores, smoothChamber } from './chambers';
import { faultDirections, faultLines } from './faults';
import { repairGuards, walkedLane } from './guards';
import { basinCount, caveHeights, hydrology, lowRooms, springByTheMouth } from './hydrology';
import { caveSites } from './caveSites';
import { type LaneWay, claimLane, laneEnds, mainRoute, wideLane, windingWay } from './mainPath';
import { walkLooseNecks } from './looseNecks';
import { holdNecks } from './necks';
import { stairWays } from './stairWays';
import { type TunnelWidth, carveTunnel, doorOnLane, pinchLane, shapeDoors, tunnelEnds } from './tunnels';
import { inFloorClimbs } from './veins/climbs';
import { blockWays, passageCells, streamFalls } from './veins/doorWays';
import { narrowRoutes, settleNarrowRoutes } from './veins/narrowRoutes';
import { fillPockets, warpCave } from './caveWarp';
import { holdPastMouths, stairsJoin } from './caveFits';

export interface ShapedCaves {
  floors: PlannedFloor[];
  cave: CaveModel;
}

/** A hub: three doors or more, where passages meet and a chamber grows largest. */
const HUB_DOORS = 3;

const lerp = (range: readonly [number, number], t: number): number => range[0] + (range[1] - range[0]) * t;

function shapeChambers(seed: number, index: number, shaping: CaveShaping, faults: readonly number[], floor: PlannedFloor, grid: CaveGrid, lane: ReadonlySet<string>): Map<DungeonRoom, ChamberField> {
  const fields = new Map<DungeonRoom, ChamberField>();
  const normal = floor.rooms.filter((room) => room.kind === 'room');
  const largest = normal.reduce<DungeonRoom | undefined>((best, room) => (!best || room.w * room.h > best.w * best.h ? room : best), undefined);
  for (const room of normal) {
    const rng = floorStream(seed, 'cave', index, `chamber:${room.id}`);
    const doors = floor.doors.filter((door) => door.from === room.id || door.to === room.id).length;
    const roll = rng();
    const fill = doors >= HUB_DOORS || room === largest ? shaping.fill[1] : lerp(shaping.fill, roll);
    const { seeds, whole } = chamberSeeds(grid, room, lane);
    if (!whole) console.debug(`[Atlas] cave floor ${index} of seed ${seed}: chamber ${room.id} could not be joined round its stairwells`);
    fields.set(room, growChamber(rng, grid, room, seeds, { gamma: lerp(shaping.gamma, rng()), stretch: shaping.stretch, fill, faults }));
    smoothChamber(grid, room, new Set(seeds.map((c) => cellKey(c.x, c.y))), rng() < 0.5 ? 1 : 2);
  }
  return fields;
}

/** Chambers swell past their rectangles and tunnels widen here and there, once every room has its cells. */
function swellRooms(seed: number, index: number, floor: PlannedFloor, grid: CaveGrid, fields: ReadonlyMap<DungeonRoom, ChamberField>): void {
  const noise = widenNoise(floorStream(seed, 'cave', index, 'widen'));
  for (const room of floor.rooms) {
    const field = fields.get(room);
    if (field) swellChamber(grid, floor.doors, room, field);
    // A narrow route stays one cell across its whole length.
    else if (!room.narrow) widenTunnel(noise, grid, floor, room);
  }
}

/**
 * How many cells across a tunnel runs: the lane's two on the main path; off it two now and then
 * (`sideWide`). With the book's rules a passage is as wide as the way it was entered by: a narrow
 * route (`DungeonRoom.narrow`) one cell, a walk ten feet wide two, a broader walk between two great
 * chambers three, on the main path too (`passageCells`); a narrower walk one or two. Every tunnel
 * but a narrow route still swells here and there (`widenTunnel`), as rock breaks.
 */
function tunnelWidth(rng: () => number, shaping: CaveShaping, floor: PlannedFloor, room: DungeonRoom, onLane: boolean, entered: DungeonDoor | undefined): TunnelWidth {
  const way = shaping.veins && entered ? passageCells(entered, room, floor.rooms, floor.doors) : undefined;
  if (onLane) return way === 3 ? 3 : 2;
  if (room.narrow) return 1;
  const wide = rng() < shaping.sideWide;
  return way ?? (wide ? 2 : 1);
}

function shapeTunnels(seed: number, index: number, shaping: CaveShaping, floor: PlannedFloor, grid: CaveGrid, lane: ReadonlySet<string>): void {
  for (const room of floor.rooms) {
    if (room.kind === 'room') continue;
    const rng = floorStream(seed, 'cave', index, `tunnel:${room.id}`);
    const onLane = grid.cellsOf(room.id).some((c) => lane.has(cellKey(c.x, c.y)));
    const entered = floor.doors.find((door) => door.to === room.id && door.from === room.parent);
    const width = tunnelWidth(rng, shaping, floor, room, onLane, entered);
    // A cave with the book's rules runs long passages, which keep clear of the walls they share.
    carveTunnel(rng, grid, room, tunnelEnds(grid, room, floor.doors), width, lane, floor.rooms, shaping.veins !== undefined);
  }
}

/**
 * How many basins each floor holds: the cave's share of all its low rooms, given to the deepest
 * floor first, and no floor above holding more than the deepest: water runs down.
 */
function basinsPerFloor(floors: readonly PlannedFloor[], level: number, dry: boolean, more = 1): number[] {
  const last = floors.length - 1;
  const lows = floors.map((floor, index) => lowRooms(floor, floor.cave?.heights ?? [], index === last).length);
  const total = lows.reduce((a, b) => a + b, 0);
  // A cave that holds still pools wherever it can fills more of its low rooms.
  let left = dry ? 0 : Math.min(total, Math.round(basinCount(total, level) * more));
  const out = lows.map(() => 0);
  for (let index = last; index >= 0; index--) {
    out[index] = Math.min(lows[index]!, left, index === last ? Infinity : out[last]!);
    left -= out[index]!;
  }
  return out;
}

/**
 * The floor's grid with its lane claimed and every chamber's core kept: a winding lane where one
 * fits and leaves every chamber a core, which may stand out in its swell; else the plain lane; else
 * the plain lane with cores inside their rectangles, as the layout made sure of. A try counts only
 * where every chamber holding a stairwell can also join the row it is entered from round it
 * (`stairsJoin`): a winding lane or a core out in the swell may take the cells that way needs.
 * With the book's rules (`necks`) the main path's pinches and the rock round every narrow way are
 * held before the cores, so a core keeps off a neck rather than the neck off the core; the floor it
 * returns walks every narrow way whose neck could not be held (`walkLooseNecks`).
 */
function laneGrid(seed: number, index: number, floor: PlannedFloor, boss: boolean, count: number, necks: boolean): { grid: CaveGrid; lane: CellPoint[]; pinched: Set<number>; floor: PlannedFloor } {
  const [from, to] = laneEnds(index, count, floor, boss);
  const route = mainRoute(floor, from, to);
  // A lane does not hang on the cores, so the plain one is found once for both tries that take it.
  const lanes = new Map<LaneWay | undefined, CellPoint[] | null>();
  const laid = (way: LaneWay | undefined, out: boolean): { grid: CaveGrid; lane: CellPoint[] | null; pinched: Set<number>; floor: PlannedFloor; fits: boolean } => {
    const grid = new CaveGrid(floor, index);
    if (necks && index === 0) holdPastMouths(grid, floor);
    if (!lanes.has(way)) lanes.set(way, wideLane(grid, floor, route, from, to, way));
    const lane = lanes.get(way)!;
    if (lane) claimLane(grid, floor, route, lane, way?.swell);
    const laneKeys = new Set((lane ?? []).map((c) => cellKey(c.x, c.y)));
    const pinched = necks ? pinchLane(grid, floor, laneKeys) : new Set<number>();
    const onLane = (k: number): boolean => doorOnLane(floor.doors[k]!, k, laneKeys, grid);
    const routed = necks ? narrowRoutes(floor, (room) => grid.cellsOf(room.id).some((c) => laneKeys.has(cellKey(c.x, c.y))), onLane) : floor;
    const loose = necks ? holdNecks(floorStream(seed, 'cave', index, 'necks'), grid, routed, laneKeys, pinched) : new Set<number>();
    // A way whose neck could not be held is walked, and the lane walks a pinch among them two cells wide.
    const walked = settleNarrowRoutes(walkLooseNecks(routed, loose, onLane));
    for (const k of loose) pinched.delete(k);
    return { grid, lane, pinched, floor: walked, fits: lane !== null && reserveCores(grid, floor.rooms, out) && stairsJoin(grid, floor) };
  };
  // The last try is the layout's own, which it made sure of.
  const tries: readonly [LaneWay | undefined, boolean][] = [[windingWay(floorStream(seed, 'cave', index, 'lane')), true], [undefined, true], [undefined, false]];
  let tried = laid(...tries[0]!);
  for (const next of tries.slice(1)) {
    if (tried.fits) break;
    tried = laid(...next);
  }
  return { grid: tried.grid, lane: tried.lane ?? [], pinched: tried.pinched, floor: tried.floor };
}

interface FloorShaping {
  seed: number;
  shaping: CaveShaping;
  faults: readonly number[];
  boss: boolean;
  dry: boolean;
}

function shapeFloor(how: FloorShaping, floors: readonly PlannedFloor[], index: number): PlannedFloor {
  const { seed, shaping, faults, boss } = how;
  const veins = shaping.veins?.rules;
  const { grid, lane, pinched, floor } = laneGrid(seed, index, floors[index]!, boss, floors.length, veins !== undefined);
  const laneKeys = new Set(lane.map((c) => cellKey(c.x, c.y)));
  const fields = shapeChambers(seed, index, shaping, faults, floor, grid, laneKeys);
  shapeTunnels(seed, index, shaping, floor, grid, laneKeys);
  swellRooms(seed, index, floor, grid, fields);
  warpCave(floorStream(seed, 'cave', index, 'warp'), grid, floor, faults);
  fillPockets(grid);
  const shaped = shapeDoors(floor.doors, laneKeys, grid, veins && floor.rooms, pinched);
  const doors = veins ? blockWays(floorStream(seed, 'cave', index, 'blocked'), shaped, floor.rooms, (k) => doorOnLane(floor.doors[k]!, k, laneKeys, grid), veins.blockedWays) : shaped;
  const left = repairGuards(grid, { ...floor, doors }, lane, veins !== undefined);
  if (left.length > 0) console.debug(`[Atlas] cave floor ${index} of seed ${seed} keeps ${left.length} token-fit problems`, left.map((p) => p.kind));
  const rooms = settleNarrowRoutes({ rooms: floor.rooms, doors }).rooms.map((room) => ({ ...room, cells: grid.cellsOf(room.id) }));
  const lines = faultLines(floorStream(seed, 'cave', index, 'faults'), { rooms }, faults, veins?.faultLines);
  const cave: CaveFloor = { lane: walkedLane(grid, doors, lane), heights: caveHeights(seed, index, rooms), faults: lines, basins: [], streams: [], dams: [] };
  return { rooms, doors, stairs: floor.stairs.map((stair) => ({ ...stair })), cave };
}

/**
 * Every floor of a Cavern shaped, its heights, water and ways between floors worked out, and the
 * cave's variant and fault directions. `level` is the dungeon's water level; `stack` says which
 * floor lies above which.
 */
export function shapeCaves(seed: number, params: DungeonParams, floors: readonly PlannedFloor[], boss: boolean, level: number, stack: FloorStack): ShapedCaves {
  const shaping = params.cave;
  if (!shaping) throw new Error('shapeCaves needs a Cavern’s params');
  const faults = faultDirections(stream(seed, 'cave', 'faults'), floors[0]?.rooms ?? []);
  // The GM's water level wins over the tags, as in every theme: a cave is dry where the level is nothing.
  const how: FloorShaping = { seed, shaping, faults, boss, dry: level <= 0 };
  const shaped = floors.map((_, index) => shapeFloor(how, floors, index));
  const veins = shaping.veins;
  const takes = basinsPerFloor(shaped, level, how.dry, veins?.rules.basins);
  shaped.forEach((floor, index) => {
    const cave = floor.cave!;
    Object.assign(cave, hydrology(floorStream(seed, 'cave', index, 'water'), floor, cave.heights, level, how.dry, takes[index], index === shaped.length - 1));
    // A cave whose water never runs calm drops every stream over falls.
    if (veins?.rules.streamFalls) floor.doors = streamFalls(floor.doors, cave.streams, cave.lane);
    if (veins) floor.doors = inFloorClimbs(floorStream(seed, 'cave', index, 'climbs'), floor.doors, cave);
  });
  stairWays(stream(seed, 'cave', 'ways'), shaped, stack, veins?.rules.pitchesOnly);
  if (params.tags.has('inhabited') && !how.dry && shaped[0]) springByTheMouth(shaped[0], caveSites(shaped)[0]!);
  return { floors: shaped, cave: { variant: shaping.variant, faults, ...(veins && { character: veins.character }) } };
}
