import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { breakdownProblems, geologyProblems, rimstoneProblems } from '../caveRules';

const CAVE_FLOOR_KINDS = new Set(['guano', 'bone-litter', 'sulphur-crust', 'rimstone', 'boulder-choke']);
const SETS: string[][] = [[], ['acid'], ['wet'], ['lava', 'deep'], ['flooded']];

describe('a cave\'s drawn floor textures', () => {
  it.each([1, 2, 3])('places each new kind where its rule wants it on %i floors', (floors) => {
    const found = new Set<string>();
    for (let k = 1; k <= 200; k++) {
      const model = generateDungeon({ seed: k * 7_717 + floors, theme: 'cavern', tags: SETS[k % SETS.length]!, floors });
      expect([...geologyProblems(model, true), ...rimstoneProblems(model), ...breakdownProblems(model).problems], `seed ${model.seed}`).toEqual([]);
      for (const floor of model.floors) for (const piece of floor.terrain) {
        if (CAVE_FLOOR_KINDS.has(piece.kind)) found.add(piece.kind);
        if (piece.kind === 'guano') expect(floor.rooms[piece.room]?.type).toBe('roost');
        if (piece.kind === 'bone-litter') expect(floor.rooms[piece.room]?.type).toBe('den');
      }
    }
    expect([...found].sort()).toEqual([...CAVE_FLOOR_KINDS].sort());
  }, 600_000);
});
