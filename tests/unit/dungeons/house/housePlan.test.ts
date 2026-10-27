import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { allReached, doorsOnEdges, hallAtTheFront, nestedFloors, onCorridors, oneBackStair, stacksRise, stairsLineUp, wallsAlign } from './houseRules';
import { mainRoomsLit } from './houseWindowRules';

/** Houses of every size and floor count: the planner's rules (research §5.10, 1–4, 6, 8–10, 15–18). */
const RUNS: { label: string; model: DungeonModel }[] = [];
for (let k = 1; k <= 60; k++) {
  for (const size of ['small', 'medium', 'large']) {
    for (const floors of [1, 2, 3, 4]) RUNS.push({ label: `seed ${k} ${size} ${floors}`, model: generateDungeon({ seed: k * 7919 + floors, theme: 'mansion', tags: [size], floors }) });
  }
}

const RULES = { nestedFloors, stairsLineUp, oneBackStair, stacksRise, hallAtTheFront, allReached, onCorridors, mainRoomsLit, wallsAlign, doorsOnEdges };

describe('a house as the planner lays it out', () => {
  for (const [name, rule] of Object.entries(RULES)) {
    it(`keeps ${name}`, () => {
      const problems = RUNS.flatMap(({ label, model }) => rule(model).map((p) => `${label}: ${p}`));
      expect(problems.slice(0, 8)).toEqual([]);
    });
  }

  it('has its walls on cell edges on every floor, and a cellar about two times in five', () => {
    for (const { model } of RUNS) expect(model.floors.every((f) => f.walls === 'edges')).toBe(true);
    const multi = RUNS.filter(({ model }) => model.floors.length > 1);
    const share = multi.filter(({ model }) => (model.below ?? 0) > 0).length / multi.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
  });

  it('gives the same house for the same seed', () => {
    for (const { model } of RUNS.slice(0, 30)) {
      const again = generateDungeon({ seed: model.seed, theme: 'mansion', tags: model.tags, floors: model.floors.length });
      expect(again).toEqual(model);
    }
  });
});
