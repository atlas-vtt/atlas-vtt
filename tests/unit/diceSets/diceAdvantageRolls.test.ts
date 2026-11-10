import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { advantageSide, advantageSidesFor } from '../../../src/app/tools/diceAdvantage';
import { rollDiceFormula, type DiceRollInputs } from '../../../src/app/tools/DiceTool';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';

const builtIn = (id: string): DiceSet => BUILT_IN_DICE_SETS.find((set) => set.id === id)!;
const d20 = builtIn('builtin:d20');
const rollUnder = builtIn('builtin:d20-roll-under');
const percentile = builtIn('builtin:d100-roll-under');
const powerRoll = builtIn('builtin:power-roll');
const set = (fields: Partial<DiceSet>): DiceSet => ({ id: 'set', name: 'Set', builtIn: false, crit: 'natural', dice: [{ count: 1, sides: 20 }], ...fields });

/** Inputs whose dice show `faces` in turn: each value is the face a d`sides` shows; counts every random number drawn. */
function inputs(...faces: Array<[number, number]>): DiceRollInputs & { drawn: () => number } {
  const queue = [...faces];
  let drawn = 0;
  return {
    random: () => {
      drawn += 1;
      const [face, sides] = queue.shift() ?? [1, 2];
      return (face - 0.5) / sides;
    },
    rollId: () => 'roll',
    roller: () => 'GM',
    onFormulaError: vi.fn(),
    drawn: () => drawn,
  };
}

const values = (rolls: ReadonlyArray<{ value: number; dropped?: true }>) => rolls.map((roll) => (roll.dropped ? `(${roll.value})` : roll.value));

describe('rolling one more and keeping the best', () => {
  it('rolls 2d20 for a d20 and keeps the higher with advantage, the lower with disadvantage', () => {
    const up = rollDiceFormula('+5', d20, inputs([4, 20], [17, 20]), undefined, 'advantage')!;
    expect(values(up.rolls)).toEqual(['(4)', 17]);
    expect(up.total).toBe(22);
    expect(up.advantage).toBe('advantage');
    expect(up.formula).toBe('1d20+5');

    const down = rollDiceFormula('+5', d20, inputs([4, 20], [17, 20]), undefined, 'disadvantage')!;
    expect(values(down.rolls)).toEqual([4, '(17)']);
    expect(down.total).toBe(9);
  });

  it('keeps the lower on a roll-under set for advantage', () => {
    expect(values(rollDiceFormula('', rollUnder, inputs([4, 20], [17, 20]), undefined, 'advantage')!.rolls)).toEqual([4, '(17)']);
    expect(values(rollDiceFormula('', rollUnder, inputs([4, 20], [17, 20]), undefined, 'disadvantage')!.rolls)).toEqual(['(4)', 17]);
  });

  it('keeps the best of the original count for a set of several dice: 2d6 becomes 3d6, two kept', () => {
    const pair = set({ dice: [{ count: 2, sides: 6, name: 'Pair' }], advantage: { kind: 'keep' }, disadvantage: { kind: 'keep' } });
    const up = rollDiceFormula('', pair, inputs([2, 6], [5, 6], [4, 6]), undefined, 'advantage')!;
    expect(values(up.rolls)).toEqual(['(2)', 5, 4]);
    expect(up.total).toBe(9);
    expect(up.rolls.every((die) => die.name === 'Pair')).toBe(true);
    expect(values(rollDiceFormula('', pair, inputs([2, 6], [5, 6], [4, 6]), undefined, 'disadvantage')!.rolls)).toEqual([2, '(5)', 4]);
  });

  it('judges criticals by the kept die only', () => {
    expect(rollDiceFormula('', d20, inputs([20, 20], [3, 20]), undefined, 'disadvantage')!.crit).toBeNull();
    expect(rollDiceFormula('', d20, inputs([1, 20], [12, 20]), undefined, 'advantage')!.crit).toBeNull();
    expect(rollDiceFormula('', d20, inputs([1, 20], [20, 20]), undefined, 'advantage')!.crit).toBe('high');
  });

  it('lets the extra die of an exploding set explode, and keeps or drops each die with its explosion', () => {
    const exploding = set({ dice: [{ count: 1, sides: 6 }], explode: { dice: 'default', repeats: false, highFaces: 1, lowFaces: 0 }, advantage: { kind: 'keep' } });
    const result = rollDiceFormula('', exploding, inputs([3, 6], [6, 6], [2, 6]), undefined, 'advantage')!;
    expect(values(result.rolls)).toEqual(['(3)', 6, 2]);
    expect(result.total).toBe(8);
  });

  it('rolls a whole second d100 on a percentile set, or with tens only one more tens die sharing the units', () => {
    const whole = rollDiceFormula('', percentile, inputs([47, 100], [83, 100]), undefined, 'advantage')!;
    expect(values(whole.rolls)).toEqual([47, '(83)']);

    const coc = { ...percentile, advantage: { kind: 'keep' as const, tensOnly: true as const }, disadvantage: { kind: 'keep' as const, tensOnly: true as const } };
    // 47, then a tens die showing 2 (20): 27 shares the units 7.
    const bonus = rollDiceFormula('', coc, inputs([47, 100], [3, 10]), undefined, 'advantage')!;
    expect(values(bonus.rolls)).toEqual(['(47)', 27]);
    expect(bonus.rolls[1]).toMatchObject({ die: 'd100', sharedUnits: true });
    expect(bonus.total).toBe(27);
    const penalty = rollDiceFormula('', coc, inputs([47, 100], [3, 10]), undefined, 'disadvantage')!;
    expect(penalty.total).toBe(47);
    // Tens 00 with units 0 is 100.
    expect(rollDiceFormula('', coc, inputs([40, 100], [1, 10]), undefined, 'disadvantage')!.total).toBe(100);
  });
});

describe('adding a die or a number', () => {
  const duality = set({
    crit: 'doubles',
    dice: [{ count: 1, sides: 12, name: 'Hope' }, { count: 1, sides: 12, name: 'Fear' }],
    advantage: { kind: 'die', sides: 6, name: 'Advantage', colour: '#ca8a04' },
    disadvantage: { kind: 'die', sides: 6 },
  });

  it('adds the rule\'s die with its name and colour, or subtracts it', () => {
    const up = rollDiceFormula('+2', duality, inputs([7, 12], [5, 12], [4, 6]), undefined, 'advantage')!;
    expect(up.rolls.at(-1)).toEqual({ die: 'd6', value: 4, max: 6, advantage: true, name: 'Advantage', colour: '#ca8a04' });
    expect(up.total).toBe(18);
    const down = rollDiceFormula('+2', duality, inputs([7, 12], [5, 12], [4, 6]), undefined, 'disadvantage')!;
    expect(down.rolls.at(-1)).toMatchObject({ value: 4, negative: true, advantage: true });
    expect(down.total).toBe(10);
  });

  it('never counts the added die as one of the set\'s for criticals', () => {
    const doubles = set({ crit: 'doubles', dice: [{ count: 2, sides: 6 }], advantage: { kind: 'die', sides: 6 } });
    expect(rollDiceFormula('', doubles, inputs([3, 6], [5, 6], [3, 6]), undefined, 'advantage')!.crit).toBeNull();
  });

  it('adds or takes off a number, Draw Steel\'s edge and bane', () => {
    expect(rollDiceFormula('+3', powerRoll, inputs([5, 10], [6, 10]), undefined, 'advantage')!).toMatchObject({ total: 16, modifiers: 5 });
    expect(rollDiceFormula('+3', powerRoll, inputs([5, 10], [6, 10]), undefined, 'disadvantage')!).toMatchObject({ total: 12, modifiers: 1 });
  });
});

describe('when advantage changes a roll', () => {
  it('cancels when both sides are asked for', () => {
    expect(advantageSide(true, true)).toBeNull();
    expect(advantageSide(false, false)).toBeNull();
    expect(advantageSide(true, false)).toBe('advantage');
    expect(advantageSide(false, true)).toBe('disadvantage');
  });

  it('changes only a roll of the set\'s dice: damage rolls as it is and records no side', () => {
    const damage = rollDiceFormula('2d8+3', d20, inputs([4, 8], [5, 8]), undefined, 'advantage')!;
    expect(damage.rolls).toHaveLength(2);
    expect(damage.advantage).toBeUndefined();
    expect(advantageSidesFor('2d8+3', d20)).toEqual([]);
    expect(advantageSidesFor('1d20+4', d20)).toEqual(['advantage', 'disadvantage']);
    expect(advantageSidesFor('+4', d20)).toEqual(['advantage', 'disadvantage']);
    expect(advantageSidesFor('+4', builtIn('builtin:d10-exploding'))).toEqual([]);
    // A roll that keeps dice of its own is no roll of the set's dice.
    expect(advantageSidesFor('2d20kh1+4', d20)).toEqual([]);
  });

  it('refuses advantage that takes a roll past a limit before any die is rolled', () => {
    // The set's die and 19 numbers: 20 terms, the most a formula may have.
    const atLimit = '+1'.repeat(19);
    const die = set({ advantage: { kind: 'die', sides: 6 } });
    const given = inputs();
    expect(rollDiceFormula(atLimit, die, given, undefined, 'advantage')).toBeNull();
    expect(given.onFormulaError).toHaveBeenCalledWith({ ok: false, code: 'terms' });
    expect(given.drawn()).toBe(0);
    const hundred = inputs();
    expect(rollDiceFormula('100d20', d20, hundred, undefined, 'advantage')).toBeNull();
    expect(hundred.onFormulaError).toHaveBeenCalledWith({ ok: false, code: 'dice' });
    expect(hundred.drawn()).toBe(0);
  });
});
