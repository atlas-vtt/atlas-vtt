import { describe, expect, it, vi } from 'vitest';
import { GROUNDS_KINDS } from '../../../../src/app/dungeons/houseModel';

// The grounds as they will be once drawn, so their rules (7, 20, 21) are held too.
vi.mock('../../../../src/app/dungeons/drawnKinds', async (original) => ({ ...(await original<object>()), DRAWN_GROUNDS_KINDS: new Set(GROUNDS_KINDS) }));

import { stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { coverProblems } from '../coverInvariants';
import { holeProblems } from '../holeInvariants';
import { physicsProblems } from '../themeTerrainInvariants';
import { bridgeProblems, cellProblems, clearanceProblems, routeProblems, stairClearanceProblems } from '../terrainInvariants';
import { groundsRules } from './groundsRules';
import { allReached, doorsOnEdges, hallAtTheFront, nestedFloors, onCorridors, oneBackStair, stacksRise, stairsLineUp, wallsAlign } from './houseRules';
import { mainRoomsLit, windowsOverWindows } from './houseWindowRules';
import { baizeDoor, mirrored, receptionApart, roomSizes, stacksWarm, structureOnly, zones } from './houseZoneRules';

/**
 * The 24 believability rules of a house (research §5.10) over many Haunted Mansions: 300 seeds,
 * each with one to four floors and one of the tag sets below, every rule checked apart from the
 * planner; with the terrain rules every dungeon keeps.
 */

const SEEDS = 300;
const TAG_SETS: readonly string[][] = [[], ['small'], ['medium'], ['large'], ['ruined'], ['overgrown', 'inhabited'], ['large', 'ruined', 'overgrown']];

interface Run {
  label: string;
  tags: string[];
  model: DungeonModel;
  ms: number;
}

const RUNS: Run[] = [];
for (let k = 1; k <= SEEDS; k++) {
  const tags = TAG_SETS[k % TAG_SETS.length] ?? [];
  const floors = 1 + (k % 4);
  const seed = k * 6131 + floors;
  const start = performance.now();
  const model = generateDungeon({ seed, theme: 'mansion', tags, floors });
  RUNS.push({ label: `seed ${seed} [${tags.join(',')}] ${floors}f`, tags, model, ms: performance.now() - start });
}

const RULES: Record<string, (m: DungeonModel) => string[]> = {
  '1 storeys stand on the floor below': nestedFloors,
  '2 stairwells line up and are reached from floor': stairsLineUp,
  '3 one back stair from bottom to top': oneBackStair,
  '4 stacks rise through the same cells': stacksRise,
  '5 the main rooms are warmed from stacks, fireplaces stand on them (the rest in houseChimneys.test.ts)': stacksWarm,
  '6 the hall takes the front door and the main stair': hallAtTheFront,
  '7 a wide way from the gate to the front door, on its axis': (m) => [...groundsRules.wideWalkIn(m), ...groundsRules.approachOnAxis(m)],
  '8 every room is reached': allReached,
  '9–10 rooms open on corridors, corridors are wide enough': onCorridors,
  '11 no door from drawing room to dining room or kitchen': receptionApart,
  '12 the baize door parts the service side': baizeDoor,
  '13 service below stairs, bedrooms above': zones,
  '14 room sizes': roomSizes,
  '15 main rooms are lit, windows stand over windows (the rest in houseWindows.test.ts)': (m) => [...mainRoomsLit(m), ...windowsOverWindows(mirrored)(m)],
  '16 walls stand on walls below': wallsAlign,
  '17–18 doors on edges, clear of corners and stairs': doorsOnEdges,
  '20 outbuildings on the lot, each by a path; walks laid out from door to way': (m) => [...groundsRules.outbuildings(m), ...groundsRules.walksLaidOut(m)],
  '21 the boundary closed but at its gates': groundsRules.closedBoundary,
  '22 structure only': structureOnly,
  'terrain keeps its cells, ways, bridges and holes': (m) =>
    m.floors.flatMap((floor, i) => [...cellProblems(floor), ...clearanceProblems(floor, i, stackOf(m)), ...routeProblems(floor), ...bridgeProblems(floor), ...stairClearanceProblems(floor, i, stackOf(m))]).concat(holeProblems(m), physicsProblems(m), coverProblems(m)),
};

describe('Haunted Mansions as houses', () => {
  for (const [name, rule] of Object.entries(RULES)) {
    it(`keep rule ${name}`, () => {
      const problems = RUNS.flatMap(({ label, model }) => rule(model).map((p) => `${label}: ${p}`));
      expect(problems.slice(0, 8)).toEqual([]);
    });
  }

  it('keep rule 19: the footprint mirrors about the front door in symmetric styles, most houses', () => {
    expect(RUNS.filter(({ model }) => mirrored(model)).length / RUNS.length).toBeGreaterThan(0.4);
  });

  it('keep rule 23: the same request gives the same house, and a house of four floors is quick', () => {
    for (const { model, tags } of RUNS.slice(0, 40)) expect(generateDungeon({ seed: model.seed, theme: 'mansion', tags, floors: model.floors.length })).toEqual(model);
    const times = RUNS.filter(({ model }) => model.floors.length === 4).map((r) => r.ms).sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(120);
  });
});
