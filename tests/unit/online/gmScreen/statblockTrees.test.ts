import { describe, expect, it } from 'vitest';
import { DRAWN_CLASSES, parseGmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import trees from '../../../fixtures/gmScreenStatblockTrees.json';

/** The five statblocks as the DM screen draws them, as Atlas sends them (written by `tests/gpu/gmScreenStatblocks.gpu.test.ts`). */
describe('the statblocks of the fidelity fixture', () => {
  it('are one of every kind', () => {
    expect(trees.statblocks.map((statblock) => statblock.id)).toEqual(['native', 'auto', 'fs-5e', 'fs-pf2e', 'fs-daggerheart']);
  });

  for (const statblock of trees.statblocks) {
    it(`reach the page as Atlas sent them: ${statblock.id}`, () => {
      expect(parseGmScreenMessage(JSON.parse(JSON.stringify(statblock.message)))).toEqual(statblock.message);
      expect(statblock.classes.filter((name) => !DRAWN_CLASSES.has(name))).toEqual([]);
      expect(JSON.stringify(statblock.message)).not.toMatch(/Bestiary\/|app:\/\/|"href"|"style"/);
    });
  }
});
