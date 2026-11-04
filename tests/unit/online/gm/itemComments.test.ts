import { describe, expect, it } from 'vitest';
import { bookItemOf } from '../../../../src/app/online/gm/book/bookItem.ts';
import { lootCardOf } from '../../../../src/app/online/gm/log/lootCard.ts';
import type { LootDraw } from '../../../../src/app/loot/lootRoller';

const draw: LootDraw = {
  id: 'd',
  notePath: 'Items/Bow.md',
  name: 'Sessile Oak Bow',
  source: [],
  description: 'Slams into targets. %%Only the GM knows it is cursed.%% On **Critical Damage** something is torn off.<!-- reroll if a player has one -->',
  properties: [{ id: 'details', label: 'Details', value: 'd8, _bulky_ %%see the curse%%' }],
};

describe("the GM's comments in an item", () => {
  it('never reach a book', () => {
    const item = bookItemOf(draw, '0123456789abcdef01234567', 1);
    expect(item?.description).toBe('Slams into targets.  On **Critical Damage** something is torn off.');
    expect(item?.properties).toEqual([{ label: 'Details', value: 'd8, _bulky_' }]);
  });

  it('never reach the log', () => {
    const card = lootCardOf(draw);
    expect(JSON.stringify(card)).not.toMatch(/cursed|reroll|see the curse/);
    expect(card?.description).toContain('**Critical Damage**');
  });
});
