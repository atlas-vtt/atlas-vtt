import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { caveSites } from '../../../../src/app/dungeons/layout/cavern/caveSites';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { readTags } from '../../../../src/app/dungeons/tags';
import { isInhabited } from '../../../../src/app/dungeons/themes/cavern/inhabited';
import { refusedTags } from '../../../../src/app/dungeons/themes/themes';

const cave = (seed: number, tags: string[], floors = 1): DungeonModel => generateDungeon({ seed, theme: 'cavern', tags, floors });
const livedIn = (model: DungeonModel): boolean => model.floors[0]!.rooms.some((r) => r.type === 'guard-post');

describe('a lived-in cavern', () => {
  it('is lived in where the inhabited tag asks and a hollow lies near the mouth and near water', () => {
    let inhabited = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const model = cave(seed * 811, ['inhabited', 'wet'], 1 + (seed % 2));
      const expected = isInhabited(new Set(readTags(model.tags)), caveSites(model.floors));
      expect(livedIn(model), `seed ${seed * 811}`).toBe(expected);
      if (expected) inhabited++;
    }
    expect(inhabited).toBeGreaterThan(20);
  });

  it('is always lived in where the tag asks and water rises', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const model = generateDungeon({ seed: seed * 811, theme: 'cavern', tags: ['inhabited'], floors: 1 + (seed % 3) });
      expect(livedIn(model), `seed ${seed * 811}, ${model.floors.length} floors`).toBe(true);
    }
  });

  it('never is without the tag', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const model = cave(seed * 811, ['wet'], 1 + (seed % 2));
      expect(isInhabited(new Set(readTags(model.tags)), caveSites(model.floors))).toBe(false);
      expect(model.floors.flatMap((f) => f.rooms).some((r) => ['guard-post', 'lived-in-hollow', 'fire-hollow', 'pen', 'store-hollow', 'chief-den'].includes(r.type ?? ''))).toBe(false);
    }
  });

  it('stays wild without a hollow near water: a dry cave, whose panel says why', () => {
    for (let seed = 1; seed <= 30; seed++) expect(livedIn(cave(seed * 811, ['inhabited', 'dry']))).toBe(false);
    expect(refusedTags('cavern', ['inhabited', 'dry']).has('inhabited')).toBe(true);
    expect(refusedTags('cavern', ['inhabited', 'wet']).has('inhabited')).toBe(false);
  });
});
