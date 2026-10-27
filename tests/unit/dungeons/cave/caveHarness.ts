import { type PlannedFloor, planFloors } from '../../../../src/app/dungeons/floors/planFloors';
import { cellKey } from '../../../../src/app/dungeons/geometry';
import { CaveGrid } from '../../../../src/app/dungeons/layout/cavern/caveGrid';
import { type CaveShaping, caveParams } from '../../../../src/app/dungeons/layout/cavern/caveParams';
import { chamberSeeds, growChamber, reserveCores, smoothChamber } from '../../../../src/app/dungeons/layout/cavern/chambers';
import { faultDirections } from '../../../../src/app/dungeons/layout/cavern/faults';
import { claimLane, laneEnds, mainRoute, wideLane } from '../../../../src/app/dungeons/layout/cavern/mainPath';
import type { CellPoint, DungeonRoom } from '../../../../src/app/dungeons/model';
import { dungeonParams, dungeonTags } from '../../../../src/app/dungeons/params';
import { rngFrom, stream } from '../../../../src/app/dungeons/rng';

/** A planned cave floor with its grid, its lane claimed and every chamber grown and smoothed. */
export interface ShapedFloor {
  seed: number;
  index: number;
  floor: PlannedFloor;
  grid: CaveGrid;
  lane: CellPoint[];
  laneKeys: Set<string>;
  shaping: CaveShaping;
  faults: number[];
}

export interface GrownChamber {
  room: DungeonRoom;
  seeds: CellPoint[];
  grown: number;
  fill: number;
}

const SETS: string[][] = [[], ['large'], ['lava'], ['deep'], ['small'], ['spacious', 'wet'], ['winding'], ['cramped', 'compact']];

/** Cave floors shaped by hand step by step, as many as `wanted`, each chamber passed to `onChamber`. */
export function shapedFloors(wanted: number, onChamber: (floor: ShapedFloor, chamber: GrownChamber) => void = () => undefined): ShapedFloor[] {
  const out: ShapedFloor[] = [];
  for (let k = 1; out.length < wanted; k++) {
    const seed = k * 4_391;
    const params = caveParams(dungeonParams(dungeonTags(seed, SETS[k % SETS.length]!)));
    const shaping = params.cave!;
    const planned = planFloors(seed, params, 1 + (k % 2), true);
    const faults = faultDirections(stream(seed, 'cave', 'faults'), planned[0]!.rooms);
    planned.forEach((floor, index) => {
      const grid = new CaveGrid(floor, index);
      const [from, to] = laneEnds(index, planned.length, floor, true);
      const route = mainRoute(floor, from, to);
      const lane = wideLane(grid, floor, route, from, to) ?? [];
      claimLane(grid, floor, route, lane);
      reserveCores(grid, floor.rooms);
      const laneKeys = new Set(lane.map((c) => cellKey(c.x, c.y)));
      const shaped = { seed, index, floor, grid, lane, laneKeys, shaping, faults };
      floor.rooms
        .filter((room) => room.kind === 'room')
        .forEach((room, n) => {
          const seeds = chamberSeeds(grid, room, laneKeys);
          const rng = rngFrom(seed + room.id);
          const fill = shaping.fill[0] + rng() * (shaping.fill[1] - shaping.fill[0]);
          const gamma = shaping.gamma[0] + rng() * (shaping.gamma[1] - shaping.gamma[0]);
          growChamber(rng, grid, room, seeds, { gamma, stretch: shaping.stretch, fill, faults });
          const grown = grid.cellsOf(room.id).length;
          smoothChamber(grid, room, new Set(seeds.map((c) => cellKey(c.x, c.y))), n % 2 === 0 ? 2 : 1);
          onChamber(shaped, { room, seeds, grown, fill });
        });
      out.push(shaped);
    });
  }
  return out;
}
