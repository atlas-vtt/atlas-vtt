import { afterEach, describe, expect, it, vi } from 'vitest';
import { diceApi } from '../../src/api/dice';
import { DisposerSet } from '../../src/api/disposers';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => vi.restoreAllMocks());

/** A roll made outside Atlas, with a tag on each die and one tag it may not keep. */
const thrown = (): DiceRollResult => ({
  id: 'p1', timestamp: 5, formula: '2d6', modifiers: 0, total: 9,
  rolls: [
    { die: 'd6', value: 4, max: 6, color: '#dd3333', colorName: 'Fire' },
    { die: 'd6', value: 5, max: 6, color: 'rgb(0 0 0)', colorName: 'x'.repeat(40) },
  ],
});

describe('tagged dice through the API', () => {
  it('publish keeps good tags, drops bad ones and never the roll; onRolled hears a frozen copy', () => {
    const { app } = createInMemoryApp();
    const dice = diceApi(app, new DisposerSet());
    const heard: DiceRollResult[] = [];
    dice.onRolled((result) => heard.push(result));
    dice.publish(thrown());
    expect(heard).toHaveLength(1);
    expect(heard[0]!.rolls).toEqual([{ die: 'd6', value: 4, max: 6, color: '#dd3333', colorName: 'Fire' }, { die: 'd6', value: 5, max: 6 }]);
    expect(heard[0]!.total).toBe(9);
    expect(Object.isFrozen(heard[0]!.rolls[0])).toBe(true);
  });

  it('a malformed tag never makes a roll malformed: throw still answers for it', () => {
    const { app } = createInMemoryApp();
    // No view tracker: nothing is open, so nothing is thrown, but the roll is a roll.
    expect(diceApi(app, new DisposerSet()).throw!('none', thrown())).toBe(false);
    expect(() => diceApi(app, new DisposerSet()).publish({ ...thrown(), rolls: [{ die: 'd6', value: 4, max: 6, color: 7 as never }] })).not.toThrow();
  });
});
