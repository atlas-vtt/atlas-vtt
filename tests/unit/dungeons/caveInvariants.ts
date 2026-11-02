import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { visibleFloor } from '../../../src/app/dungeons/render/visibleDungeon';
import { shapeDistance } from '../../../src/app/dungeons/render/geometry';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { caveFloorCells, chamberExits, narrowShares, columnProblems, faultStretch, guardProblems, laneNarrowsProblems, maskProblems, narrowsProblems, veinsProblems } from './caveChecks';
import { breakdownProblems, namedHazardProblems, formationDensity, formationProblems, geologyProblems, lifeZoneProblems, livedInProblems, waterProblems, waterShare, hazardFurnishProblems, laneProblems, lifeProblems, liquidProblems, rimstoneProblems } from './caveRules';
import { mirrorProblems, physicsProblems, shapeProblems } from './themeTerrainInvariants';
import { cavernProgramme } from '../../../src/app/dungeons/themes/cavern';
import { readTags } from '../../../src/app/dungeons/tags';
import { doorProblems, floorProblems, loopProblems, secretProblems, unreachableRooms } from './dungeonInvariants';
import { connectionProblems, entranceProblems, stairProblems } from './floorsInvariants';
import { bridgeProblems, cellProblems, routeProblems, stairClearanceProblems } from './terrainInvariants';
import { holeProblems } from './holeInvariants';
import { uncoveredFightRooms } from './coverInvariants';
import { stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { shareBound } from '../../helpers/dungeonSeeds';
import { caveRequests } from './invariantRequests';

/**
 * Every rule of a Cavern's geometry, held over many caves of one floor count: `CAVE_SEEDS` seeds
 * (400 with `VITE_DUNGEON_SEEDS=full`, 100 otherwise), each with two tag sets; on one floor
 * `FIVE_ROOM_CAVE_SEEDS` five-room caves besides. The layout's and terrain's own rules are held on the
 * same runs. How long a cave takes is the perf project's (`tests/perf/dungeons/generation.perf.test.ts`).
 */

/** Cases that draw or regenerate a hundred caves take this long at most beside the whole suite. */
const HEAVY = 300_000;

export interface CaveRun {
  seed: number;
  tags: string[];
  model: DungeonModel;
}

function runsOf(floors: number, fiveRoom: boolean): CaveRun[] {
  return caveRequests(floors, fiveRoom).map((request) => ({ seed: request.seed, tags: request.tags, model: generateDungeon(request) }));
}

/** The share of the cell's 10 × 10 samples the drawn floor covers. */
function drawnShare(shapes: ReturnType<typeof visibleFloor>['floors'], x: number, y: number): number {
  let inside = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (shapes.some((s) => shapeDistance(s, x + (i + 0.5) / 10, y + (j + 0.5) / 10) < 0)) inside++;
  return inside / 100;
}

export function describeCaveInvariants(floors: number): void {
  const runs = [...runsOf(floors, false), ...(floors === 1 ? runsOf(1, true) : [])];
  const failures = (check: (run: CaveRun) => string[]): string[] =>
    runs.flatMap((run) => check(run).map((problem) => `seed ${run.seed} [${run.tags.join(',')}]: ${problem}`)).slice(0, 10);
  const eachFloor = (check: (run: CaveRun, index: number) => string[]) => (run: CaveRun): string[] =>
    run.model.floors.flatMap((_, index) => check(run, index).map((problem) => `floor ${index}: ${problem}`));

  describe(`caverns of ${floors} floor${floors > 1 ? 's' : ''}`, () => {
    it('rule 10: every guard holds: no thin spur, no corner pinch, a 3 × 3 block in every chamber, two cells all the way', () => {
      expect(failures(eachFloor((run, i) => guardProblems(run.model, i)))).toEqual([]);
    });

    it('rule 7: every door between two rooms is a narrows of one or two cells, and two rooms’ cells meet only round it', () => {
      expect(failures(eachFloor((run, i) => narrowsProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('lay one-cell narrows off the main path only', () => {
      expect(failures(eachFloor((run, i) => laneNarrowsProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('pass every way by the book: a walk on the main path, a way on every door, every chamber at its tier, no dead end in a cave that never has one', () => {
      expect(failures(eachFloor((run, i) => veinsProblems(run.model, i)))).toEqual([]);
    });

    it('lead about a third of the chambers’ exits up or down', () => {
      const exits = runs.flatMap((run) => run.model.floors.map(chamberExits));
      const all = exits.reduce((s, e) => s + e.all, 0);
      const share = exits.reduce((s, e) => s + e.vertical, 0) / all;
      // Measured at full seeds: 0.272, 0.285 and 0.290 over one to three floors.
      expect(share).toBeGreaterThan(shareBound(0.272, all));
      expect(share).toBeLessThanOrEqual(1 / 3 + 0.08);
    });

    it('keep chambers within two cells of their rectangle, tunnels within their reach, nothing on another room’s', () => {
      expect(failures(eachFloor((run, i) => maskProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('stand no columns, rotundas or colonnades', () => {
      expect(failures(eachFloor((run, i) => columnProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('rule 9: stretch most chambers along a fault, in most caves and over all', () => {
      const stretch = runs.map((run) => faultStretch(run.model));
      const counted = stretch.filter((s) => s.long >= 3);
      // Measured at full seeds: 0.910, 0.958 and 0.971 of caves over one to three floors; 0.79 to 0.80 of all chambers.
      expect(counted.filter((s) => s.along / s.long >= 0.6).length / counted.length).toBeGreaterThanOrEqual(shareBound(0.91, counted.length));
      expect(stretch.reduce((sum, s) => sum + s.along, 0) / stretch.reduce((sum, s) => sum + s.long, 0)).toBeGreaterThanOrEqual(0.6);
    });

    // A narrow way's cell is drawn narrower than itself, the rock closing in: only its way's share (`NARROW_SHARE`, which the
    // guard measures exactly), less a row of these ten samples, which a band across the cell covers by whole rows.
    it('rule 10: draw floor over at least 60 % of every floor cell, a narrow way\'s its share', () => {
      for (const run of runs.slice(0, 100)) {
        run.model.floors.forEach((floor, index) => {
          const shapes = visibleFloor(run.model, DEFAULT_VIEW, index).floors;
          const narrow = narrowShares(floor);
          for (const k of caveFloorCells(floor)) {
            const [x, y] = k.split(',').map(Number) as [number, number];
            const least = narrow.has(k) ? narrow.get(k)! - 0.1 : 0.6;
            expect(drawnShare(shapes, x, y), `seed ${run.seed} floor ${index} cell ${k}`).toBeGreaterThanOrEqual(least);
          }
        });
      }
    }, HEAVY);

    it('are the same for the same request, and keep their shape whatever the water', () => {
      for (const run of runs.slice(0, 100)) {
        const request = { seed: run.seed, tags: run.tags, floors, theme: 'cavern' as const };
        expect(generateDungeon(request)).toEqual(run.model);
        const masks = (level: number): unknown => generateDungeon({ ...request, waterLevel: level }).floors.map((f) => f.rooms.map((r) => r.cells));
        expect(masks(0.3)).toEqual(masks(0));
        expect(masks(0.6)).toEqual(masks(0));
      }
    }, HEAVY);

    it('rule 8: lay roosts by the mouth, fungus groves by water or a roost, the den deep', () => {
      expect(failures((run) => lifeProblems(run.model))).toEqual([]);
    });

    it('rule 8: guard a lived-in cave at its mouth, keep its hollows near the mouth and water, a fire by every sleeping hollow, its chief deepest; fire pits and stones only', () => {
      expect(failures((run) => livedInProblems(run.model))).toEqual([]);
      expect(runs.filter((run) => run.tags.includes('inhabited')).some((run) => run.model.floors[0]!.rooms.some((r) => r.type === 'guard-post'))).toBe(true);
    });

    it('give every room that can hold a fight some cover: boulders, stalagmites or fallen rock', () => {
      expect(failures((run) => uncoveredFightRooms(run.model))).toEqual([]);
    });

    it('make a room a hazard room or a furnished room, never both, nature\'s formations aside, and hold one liquid at most in a room', () => {
      expect(failures(eachFloor((run, i) => [...hazardFurnishProblems(run.model, i), ...liquidProblems(run.model.floors[i]!)]))).toEqual([]);
    });

    it('rules 2, 3 and 4: lay lava deep with a ledge, acid deep on a fault ringed by crust, every chasm along a fault', () => {
      expect(failures((run) => geologyProblems(run.model, true))).toEqual([]);
    });

    it('rule 6: lay breakdown under the largest span of most floors, rubble at the foot of every pitch and shaft, chokes at a collapse chamber\'s door', () => {
      const all = runs.map((run) => breakdownProblems(run.model));
      expect(failures((run) => breakdownProblems(run.model).problems)).toEqual([]);
      expect(all.reduce((s, b) => s + b.held, 0) / all.reduce((s, b) => s + b.spans, 0)).toBeGreaterThan(0.9);
    });

    it('rule 5: lay rimstone only where water steps down', () => {
      expect(failures((run) => rimstoneProblems(run.model))).toEqual([]);
    });

    it('keep hazards, blocking terrain and furniture off the lane and furniture off them, holes off water, and shape natural features as nature does', () => {
      expect(failures(eachFloor((run, i) => laneProblems(run.model.floors[i]!)))).toEqual([]);
      expect(failures((run) => [...physicsProblems(run.model), ...shapeProblems(run.model, cavernProgramme(new Set(readTags(run.model.tags)), run.model.cave?.variant)), ...mirrorProblems(run.model)])).toEqual([]);
    });

    it('rule 1: stand water only where it gathers, run it downhill, never on raised rock; a dry cave none', () => {
      expect(failures((run) => waterProblems(run.model))).toEqual([]);
      if (floors > 1) {
        // A lived-in cave's spring by its mouth lies on the entry floor by design.
        const wet = runs.filter((run) => !run.tags.includes('dry') && !run.tags.includes('inhabited') && run.model.floors.some((f) => waterShare(f) > 0));
        const deepest = wet.filter((run) => {
          const shares = run.model.floors.map(waterShare);
          return shares.at(-1)! >= Math.max(...shares);
        });
        // Measured at full seeds: 0.968 over two floors, 0.871 over three.
        expect(deepest.length / wet.length).toBeGreaterThanOrEqual(shareBound(0.871, wet.length));
      }
    });

    it('rule 5: form stalagmites, columns, flowstone and crystals where drips, flow and air make them', () => {
      expect(failures((run) => formationProblems(run.model))).toEqual([]);
      const all = runs.map((run) => formationDensity(run.model));
      const mean = (pick: (d: ReturnType<typeof formationDensity>) => number[]): number => {
        const xs = all.flatMap(pick);
        return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      };
      expect(mean((d) => d.mouth)).toBeLessThan(mean((d) => d.others));
      if (floors > 1) {
        expect(mean((d) => d.mouth)).toBeLessThan(mean((d) => d.dryDeadEnds));
        expect(mean((d) => d.dryDeadEnds)).toBeGreaterThan(mean((d) => d.wetDeep));
      }
    });

    it('rule 8: grow green things only by the mouth, fungi by water or a roost, nothing where lava runs', () => {
      expect(failures((run) => lifeZoneProblems(run.model))).toEqual([]);
    });

    it('hold in every room named for a hazard its hazard, and stand no built dais in a cave\'s boss room', () => {
      expect(failures((run) => namedHazardProblems(run.model))).toEqual([]);
    });

    it('keep every rule of the layout and the terrain', () => {
      expect(failures(eachFloor((run, i) => [...floorProblems(run.model.floors[i]!), ...doorProblems(run.model.floors[i]!, i === 0), ...secretProblems(run.model.floors[i]!), ...loopProblems(run.model.floors[i]!)]))).toEqual([]);
      expect(failures(eachFloor((run, i) => unreachableRooms(run.model.floors[i]!).map((id) => `room ${id} unreachable`)))).toEqual([]);
      expect(failures((run) => [...stairProblems(run.model), ...connectionProblems(run.model), ...entranceProblems(run.model), ...holeProblems(run.model)])).toEqual([]);
      expect(failures(eachFloor((run, i) => [...cellProblems(run.model.floors[i]!), ...routeProblems(run.model.floors[i]!), ...bridgeProblems(run.model.floors[i]!), ...stairClearanceProblems(run.model.floors[i]!, i, stackOf(run.model))]))).toEqual([]);
    });
  });
}
