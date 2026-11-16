import { describe, expect, it } from 'vitest';
import { type RecipeContext, furnishByRecipe } from '../../../src/app/dungeons/props/recipe';
import { ALL_PROP_KINDS } from '../../../src/app/dungeons/props/propKinds';
import { CAVERN_ROOMS } from '../../../src/app/dungeons/themes/cavern/cavernRooms';
import { FORTRESS } from '../../../src/app/dungeons/themes/fortress';
import type { RoomTypeSpec } from '../../../src/app/dungeons/themes/themeTypes';
import { furnished } from './furnishFixtures';

const spec = (id: string): RoomTypeSpec => [...FORTRESS.rooms, ...CAVERN_ROOMS].find((s) => s.id === id)!;
const CONTEXT: RecipeContext = { depthRank: 0.5, ruined: false, richness: 1 };

function furnishedRoom(id: string, w: number, h: number, seed: number, context: Partial<RecipeContext> = {}, offered = ALL_PROP_KINDS) {
  const fs = furnished(w, h, { seed, offered });
  const props = furnishByRecipe(fs, spec(id).furnish, { ...CONTEXT, ...context });
  return { fs, props };
}

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

describe('placing a room\'s pieces by its recipe', () => {
  it('places the defining piece first', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(furnishedRoom('cistern', 5, 5, seed).props[0]?.kind, `seed ${seed}`).toBe('well');
      expect(furnishedRoom('lived-in-hollow', 5, 5, seed).props[0]?.kind, `seed ${seed}`).toBe('campfire');
      expect(furnishedRoom('fungus-grove', 6, 6, seed).props[0]?.kind, `seed ${seed}`).toBe('mushrooms');
    }
  });

  it('stands a column beside the stalagmites it grew among', () => {
    let columns = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { props } = furnishedRoom('grand-cavern', 8, 7, seed);
      const stalagmites = props.filter((p) => p.kind === 'stalagmites');
      for (const column of props.filter((p) => p.kind === 'column-formation')) {
        columns++;
        expect(stalagmites.some((s) => Math.hypot(s.x - column.x, s.y - column.y) <= 1.5), `seed ${seed}`).toBe(true);
      }
    }
    expect(columns).toBeGreaterThan(10);
  });

  it('gives deeper rooms of a type more of their optional pieces', () => {
    const seeds = Array.from({ length: 200 }, (_, k) => k + 1);
    const at = (depthRank: number): number => mean(seeds.map((seed) => furnishedRoom('great-hall', 7, 6, seed, { depthRank }).props.length));
    expect(at(1)).toBeGreaterThan(at(0));
  });

  it('skips a piece it is not offered and keeps the room bare without its defining piece', () => {
    expect(furnishedRoom('cistern', 5, 5, 3, {}, new Set([...ALL_PROP_KINDS].filter((kind) => kind !== 'well'))).props).toEqual([]);
    const noDais = new Set([...ALL_PROP_KINDS].filter((kind) => kind !== 'dais'));
    expect(furnishedRoom('great-hall', 7, 6, 3, {}, noDais).props.some((p) => p.kind === 'dais')).toBe(false);
  });

  it('scales optional pieces by richness', () => {
    const seeds = Array.from({ length: 200 }, (_, k) => k + 1);
    const runs = (richness: number) => seeds.map((seed) => furnishedRoom('grand-cavern', 8, 7, seed, { richness }).props);
    expect(mean(runs(0.3).map((p) => p.length))).toBeLessThan(mean(runs(1).map((p) => p.length)));
  });

  it('puts nothing on a dais', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { props } = furnishedRoom('great-hall', 7, 6, seed);
      const dais = props.find((p) => p.kind === 'dais');
      if (!dais) continue;
      expect(props.filter((p) => p !== dais && Math.hypot(p.x - dais.x, p.y - dais.y) < 1.4), `seed ${seed}`).toEqual([]);
    }
  });
});
