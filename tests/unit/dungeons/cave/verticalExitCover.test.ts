import { describe, expect, it, vi } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { uncoveredFightRooms } from '../coverInvariants';

// Every kind is offered, as in the cave invariants: avens too, before they are drawn.
vi.mock('../../../../src/app/dungeons/drawnKinds', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/app/dungeons/drawnKinds')>();
  const { ALL_PROP_KINDS } = await import('../../../../src/app/dungeons/props/propKinds');
  const { ALL_TERRAIN_KINDS } = await import('../../../../src/app/dungeons/terrain/catalog');
  return { ...original, DRAWN_PROP_KINDS: ALL_PROP_KINDS, DRAWN_TERRAIN_KINDS: ALL_TERRAIN_KINDS };
});

describe('a chamber’s exits in roof and floor beside its cover', () => {
  it('never take the last place for cover in a small chamber', () => {
    // An aven took the only cells a 4 × 3 passage-chamber and a 6 × 3 shaft-room had left for cover.
    for (const seed of [416_911, 2_262_342]) {
      const model = generateDungeon({ seed, theme: 'cavern', tags: ['cramped', 'compact', 'dry'], floors: 3 });
      expect(uncoveredFightRooms(model), `seed ${seed}`).toEqual([]);
    }
  });
});
