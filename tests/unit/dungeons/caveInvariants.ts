import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { visibleFloor } from '../../../src/app/dungeons/render/visibleDungeon';
import { shapeDistance } from '../../../src/app/dungeons/render/geometry';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { caveFloorCells, columnProblems, faultStretch, guardProblems, laneNarrowsProblems, maskProblems, narrowsProblems } from './caveChecks';
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

/**
 * Every rule of a Cavern's geometry, held over many caves of one floor count: 400 seeds, each with
 * two of the tag sets below; on one floor 200 five-room caves besides. The layout's and terrain's
 * own rules are held on the same runs.
 */

const SEEDS = 400;
/** Cases that draw or regenerate a hundred caves take this long at most beside the whole suite. */
const HEAVY = 300_000;
const TAG_SETS: readonly string[][] = [
  [],
  ['small'],
  ['large'],
  ['lava', 'deep'],
  ['wet', 'winding'],
  ['flooded', 'spacious'],
  ['cramped', 'compact', 'dry'],
  ['string', 'no-secrets'],
  ['acid', 'overgrown'],
  ['overgrown', 'wet'],
  ['inhabited', 'wet'],
];

export interface CaveRun {
  seed: number;
  tags: string[];
  model: DungeonModel;
  ms: number;
}

function runsOf(floors: number, fiveRoom: boolean): CaveRun[] {
  const out: CaveRun[] = [];
  const count = fiveRoom ? 200 : SEEDS;
  for (let k = 1; k <= count; k++) {
    const seed = k * 6_131 + floors + (fiveRoom ? 7 : 0);
    for (const offset of fiveRoom ? [0] : [0, 4]) {
      const tags = TAG_SETS[(k + offset) % TAG_SETS.length] ?? [];
      const start = performance.now();
      const model = generateDungeon({ seed, tags, floors, theme: 'cavern', fiveRoom });
      out.push({ seed, tags, model, ms: performance.now() - start });
    }
  }
  return out;
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

    it('keep chambers within two cells of their rectangle, tunnels within their reach, nothing on another room’s', () => {
      expect(failures(eachFloor((run, i) => maskProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('stand no columns, rotundas or colonnades', () => {
      expect(failures(eachFloor((run, i) => columnProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('rule 9: stretch most chambers along a fault, in most caves and over all', () => {
      const stretch = runs.map((run) => faultStretch(run.model));
      const counted = stretch.filter((s) => s.long >= 3);
      expect(counted.filter((s) => s.along / s.long >= 0.6).length / counted.length).toBeGreaterThanOrEqual(0.9);
      expect(stretch.reduce((sum, s) => sum + s.along, 0) / stretch.reduce((sum, s) => sum + s.long, 0)).toBeGreaterThanOrEqual(0.6);
    });

    it('rule 10: draw floor over at least 60 % of every floor cell', () => {
      for (const run of runs.slice(0, 100)) {
        run.model.floors.forEach((floor, index) => {
          const shapes = visibleFloor(run.model, DEFAULT_VIEW, index).floors;
          for (const k of caveFloorCells(floor)) {
            const [x, y] = k.split(',').map(Number) as [number, number];
            expect(drawnShare(shapes, x, y), `seed ${run.seed} floor ${index} cell ${k}`).toBeGreaterThanOrEqual(0.6);
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
      expect(failures((run) => [...physicsProblems(run.model), ...shapeProblems(run.model, cavernProgramme(new Set(readTags(run.model.tags)))), ...mirrorProblems(run.model)])).toEqual([]);
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
        expect(deepest.length / wet.length).toBeGreaterThanOrEqual(0.85);
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

    it('generate quickly: a cave costs little more than a Fortress of the same seed', () => {
      const sample = runs.slice(0, 100);
      const fortress = sample.map((run) => {
        const start = performance.now();
        generateDungeon({ seed: run.seed, tags: run.tags, floors, theme: 'fortress' });
        return performance.now() - start;
      });
      const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
      const ratio = mean(sample.map((run) => run.ms)) / mean(fortress);
      console.log(`cave generation ${floors} floor(s): ${mean(sample.map((r) => r.ms)).toFixed(1)} ms against ${mean(fortress).toFixed(1)} ms for a Fortress (${ratio.toFixed(2)}×)`);
      if (import.meta.env.VITE_PERF_STRICT === '1') expect(ratio).toBeLessThanOrEqual(1.6);
    });
  });
}
