/**
 * A Cavern's floors shaped from their planned rooms: per floor the main path's lane, every
 * chamber grown and smoothed, every tunnel chiselled, every door a narrows, the token-fit guards
 * repaired; the cells written onto the rooms, the lane and fault lines onto the floor.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import { cellKey } from '../../geometry';
import type { CaveFloor, CaveModel, CellPoint, DungeonRoom } from '../../model';
import type { DungeonParams } from '../../params';
import { floorStream, stream } from '../../rng';
import { CaveGrid } from './caveGrid';
import type { CaveShaping } from './caveParams';
import { swellChamber, widenNoise, widenTunnel } from './bulges';
import type { ChamberField } from './chamberField';
import { chamberSeeds, growChamber, reserveCores, smoothChamber } from './chambers';
import { faultDirections, faultLines } from './faults';
import { repairGuards } from './guards';
import { basinCount, caveHeights, hydrology, lowRooms, springByTheMouth } from './hydrology';
import { caveSites } from './caveSites';
import { type LaneWay, claimLane, laneEnds, mainRoute, wideLane, windingWay } from './mainPath';
import { stairWays } from './stairWays';
import { carveTunnel, shapeDoors, tunnelEnds } from './tunnels';
import { fillPockets, warpCave } from './caveWarp';
import { stairsJoin } from './caveFits';

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
    else widenTunnel(noise, grid, floor, room);
  }
}

function shapeTunnels(seed: number, index: number, shaping: CaveShaping, floor: PlannedFloor, grid: CaveGrid, lane: ReadonlySet<string>): void {
  for (const room of floor.rooms) {
    if (room.kind === 'room') continue;
    const rng = floorStream(seed, 'cave', index, `tunnel:${room.id}`);
    const onLane = grid.cellsOf(room.id).some((c) => lane.has(cellKey(c.x, c.y)));
    carveTunnel(rng, grid, room, tunnelEnds(grid, room, floor.doors), onLane || rng() < shaping.sideWide ? 2 : 1, lane, floor.rooms);
  }
}

/**
 * How many basins each floor holds: the cave's share of all its low rooms, given to the deepest
 * floor first, and no floor above holding more than the deepest: water runs down.
 */
function basinsPerFloor(floors: readonly PlannedFloor[], level: number, dry: boolean): number[] {
  const last = floors.length - 1;
  const lows = floors.map((floor, index) => lowRooms(floor, floor.cave?.heights ?? [], index === last).length);
  let left = dry ? 0 : basinCount(lows.reduce((a, b) => a + b, 0), level);
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
 */
function laneGrid(seed: number, index: number, floor: PlannedFloor, boss: boolean, count: number): { grid: CaveGrid; lane: CellPoint[] } {
  const [from, to] = laneEnds(index, count, floor, boss);
  const route = mainRoute(floor, from, to);
  // A lane does not hang on the cores, so the plain one is found once for both tries that take it.
  const lanes = new Map<LaneWay | undefined, CellPoint[] | null>();
  const laid = (way: LaneWay | undefined, out: boolean): { grid: CaveGrid; lane: CellPoint[] | null; fits: boolean } => {
    const grid = new CaveGrid(floor, index);
    if (!lanes.has(way)) lanes.set(way, wideLane(grid, floor, route, from, to, way));
    const lane = lanes.get(way)!;
    if (lane) claimLane(grid, floor, route, lane, way?.swell);
    return { grid, lane, fits: lane !== null && reserveCores(grid, floor.rooms, out) && stairsJoin(grid, floor) };
  };
  // The last try is the layout's own, which it made sure of.
  const tries: readonly [LaneWay | undefined, boolean][] = [[windingWay(floorStream(seed, 'cave', index, 'lane')), true], [undefined, true], [undefined, false]];
  let tried = laid(...tries[0]!);
  for (const next of tries.slice(1)) {
    if (tried.fits) break;
    tried = laid(...next);
  }
  return { grid: tried.grid, lane: tried.lane ?? [] };
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
  const floor = floors[index]!;
  const { grid, lane } = laneGrid(seed, index, floor, boss, floors.length);
  const laneKeys = new Set(lane.map((c) => cellKey(c.x, c.y)));
  const fields = shapeChambers(seed, index, shaping, faults, floor, grid, laneKeys);
  shapeTunnels(seed, index, shaping, floor, grid, laneKeys);
  swellRooms(seed, index, floor, grid, fields);
  warpCave(floorStream(seed, 'cave', index, 'warp'), grid, floor, faults);
  fillPockets(grid);
  const doors = shapeDoors(floor.doors, laneKeys, grid);
  const left = repairGuards(grid, { ...floor, doors }, lane);
  if (left.length > 0) console.debug(`[Atlas] cave floor ${index} of seed ${seed} keeps ${left.length} token-fit problems`, left.map((p) => p.kind));
  const rooms = floor.rooms.map((room) => ({ ...room, cells: grid.cellsOf(room.id) }));
  const cave: CaveFloor = { lane, heights: caveHeights(seed, index, rooms), faults: faultLines(floorStream(seed, 'cave', index, 'faults'), { rooms }, faults), basins: [], streams: [], dams: [] };
  return { rooms, doors, stairs: floor.stairs.map((stair) => ({ ...stair })), cave };
}

/**
 * Every floor of a Cavern shaped, its heights, water and ways between floors worked out, and the
 * cave's variant and fault directions. `level` is the dungeon's water level.
 */
export function shapeCaves(seed: number, params: DungeonParams, floors: readonly PlannedFloor[], boss: boolean, level: number): ShapedCaves {
  const shaping = params.cave;
  if (!shaping) throw new Error('shapeCaves needs a Cavern’s params');
  const faults = faultDirections(stream(seed, 'cave', 'faults'), floors[0]?.rooms ?? []);
  // The GM's water level wins over the tags, as in every theme: a cave is dry where the level is nothing.
  const how: FloorShaping = { seed, shaping, faults, boss, dry: level <= 0 };
  const shaped = floors.map((_, index) => shapeFloor(how, floors, index));
  const takes = basinsPerFloor(shaped, level, how.dry);
  shaped.forEach((floor, index) => {
    const cave = floor.cave!;
    Object.assign(cave, hydrology(floorStream(seed, 'cave', index, 'water'), floor, cave.heights, level, how.dry, takes[index], index === shaped.length - 1));
  });
  stairWays(stream(seed, 'cave', 'ways'), shaped);
  if (params.tags.has('inhabited') && !how.dry && shaped[0]) springByTheMouth(shaped[0], caveSites(shaped)[0]!);
  return { floors: shaped, cave: { variant: shaping.variant, faults } };
}
