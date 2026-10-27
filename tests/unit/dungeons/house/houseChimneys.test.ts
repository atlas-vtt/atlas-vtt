import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { BACK_TO_BACK, backToBack, chimneyStats, fireplacesOnStacks, fireplacesPerFloor, fireplacesWhereWarmed, mainRoomsWarm, stacksInside, stacksPerHouse } from './houseChimneyRules';

/**
 * Where a house's chimney stacks and fireplaces stand (report 2026-10-25-mansion-chimneys-research),
 * over many Haunted Mansions of one to four floors: every rule checked apart from the planner.
 */

const SEEDS = 300;
const TAG_SETS: readonly string[][] = [[], ['small'], ['medium'], ['large'], ['ruined'], ['inhabited'], ['large', 'ruined', 'overgrown']];

const MODELS: { label: string; model: DungeonModel }[] = Array.from({ length: SEEDS }, (_, i) => {
  const k = i + 1;
  const tags = TAG_SETS[k % TAG_SETS.length] ?? [];
  const floors = 1 + (k % 4);
  const seed = k * 4157 + floors;
  return { label: `seed ${seed} [${tags.join(',')}] ${floors}f`, model: generateDungeon({ seed, theme: 'mansion', tags, floors }) };
});

const RULES: Record<string, (m: DungeonModel) => string[]> = {
  'C1 few stacks, by the house\'s size': stacksPerHouse,
  'C2 fireplaces only in the rooms a manor heats': fireplacesWhereWarmed,
  'C3 every fireplace stands against a stack': fireplacesOnStacks,
  'C4 no stack in an outer wall or under a window': stacksInside,
  'C5 the main rooms border a stack': mainRoomsWarm,
  'C6 a few fireplaces per floor': fireplacesPerFloor,
};

describe('a Haunted Mansion\'s chimneys', () => {
  if (import.meta.env.VITE_CHIMNEY_STATS === 'print') {
    it('prints their numbers', () => {
      const large = MODELS.filter(({ label }) => label.includes('large'));
      console.log('CHIMNEY STATS ' + JSON.stringify(chimneyStats(MODELS.map((m) => m.model))));
      console.log('CHIMNEY STATS large ' + JSON.stringify(chimneyStats(large.map((m) => m.model))));
      for (const [name, rule] of Object.entries(RULES)) console.log(`CHIMNEY RULE ${name}: ${MODELS.filter(({ model }) => rule(model).length > 0).length} of ${SEEDS} houses break it`);
    });
    return;
  }
  for (const [name, rule] of Object.entries(RULES)) {
    it(`keep rule ${name}`, () => {
      const problems = MODELS.flatMap(({ label, model }) => rule(model).map((p) => `${label}: ${p}`));
      expect(problems.slice(0, 8)).toEqual([]);
    });
  }

  it('keep rule C7: where both rooms beside a stack are heated, their fireplaces stand back to back', () => {
    const sums = MODELS.flatMap(({ model }) => model.floors.map(backToBack)).reduce((a, b) => ({ facing: a.facing + b.facing, paired: a.paired + b.paired }));
    expect(sums.paired / sums.facing).toBeGreaterThan(BACK_TO_BACK);
  });
});
