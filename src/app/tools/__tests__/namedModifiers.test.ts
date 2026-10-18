import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_DICE_SETS, D20_DICE_SET_ID } from '../../gameSystems/builtInDiceSets';
import { DEFAULT_DICE_RULES } from '../../gameSystems/diceRules';
import { rollDiceFormula, type DiceRollInputs } from '../DiceTool';
import { namedDiceLine, rollLine } from '../diceLabels';
import {
  formulaWithNamedTerms, keptModifiersText, labelledConstant, modifierSteps, modifiersText, namedModifiersOf, plainModifier,
} from '../namedModifiers';
import { rollTestFormula as rollFormula } from './rollTestFormula';

/** A random source that makes dice of `sides` show `faces`, one after the other. */
function showing(sides: number, ...faces: number[]): () => number {
  let i = 0;
  return (): number => (faces[i++ % faces.length]! - 0.5) / sides;
}

function inputs(random: () => number): DiceRollInputs {
  return { random, rollId: () => 'roll', roller: () => 'GM', onFormulaError: vi.fn() };
}

describe('labelled constants', () => {
  it('stay apart from the other constants, and still count in modifiers and the total', () => {
    const result = rollFormula('1d20+3+2[Proficiency]-1[Bane]', showing(20, 12));
    expect(result).toMatchObject({ modifiers: 4, total: 16, linear: true });
    expect(result.named).toEqual([{ label: 'Proficiency', value: 2 }, { label: 'Bane', value: -1 }]);
  });

  it('are no modifiers of a formula that is no plain sum', () => {
    const result = rollFormula('1d6*2+2[Proficiency]', showing(6, 4));
    expect(result).toMatchObject({ modifiers: 0, named: [], total: 10, linear: false });
  });

  it('reach the roll as named modifiers, only where there are some', () => {
    const named = rollDiceFormula('+3+2[Stealth]', DEFAULT_DICE_RULES, inputs(showing(20, 20)));
    expect(named).toMatchObject({ formula: '1d20+3+2[Stealth]', modifiers: 5, total: 25, crit: 'high' });
    expect(named?.namedModifiers).toEqual([{ label: 'Stealth', value: 2 }]);
    expect(rollDiceFormula('1d20+3', DEFAULT_DICE_RULES, inputs(showing(20, 5)))).not.toHaveProperty('namedModifiers');
  });

  it('keep the crit on the dice and advantage on the set\'s die', () => {
    const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === D20_DICE_SET_ID)!;
    const result = rollDiceFormula('+1+2[Proficiency]', d20, inputs(showing(20, 1, 20)), undefined, 'advantage');
    expect(result).toMatchObject({ advantage: 'advantage', total: 23, crit: 'high', modifiers: 3 });
    expect(result?.rolls.map((die) => die.dropped ?? false)).toEqual([true, false]);
  });
});

describe('how a roll writes its modifiers', () => {
  const roll = { formula: '1d20+3+2[Stealth]', modifiers: 5, namedModifiers: [{ label: 'Stealth', value: 2 }], rolls: [] };

  it('names each labelled one after the plain sum, a subtracted one with a minus sign', () => {
    expect(plainModifier(roll)).toBe(3);
    expect(modifiersText(roll)).toBe(' + 3 + 2 Stealth');
    expect(modifiersText({ modifiers: -1, namedModifiers: [{ label: 'Bane', value: -1 }] })).toBe(' − 1 Bane');
    expect(modifiersText({ modifiers: 0, namedModifiers: [{ label: 'Luck', value: 0 }] })).toBe(' + 0 Luck');
    expect(modifiersText({ modifiers: 3 })).toBe(' + 3');
  });

  it('breaks a line only before a labelled term\'s sign', () => {
    expect(keptModifiersText(roll)).toBe(' + 3 + 2 Stealth');
  });

  it('rewrites the formula\'s labelled constants as terms of their own', () => {
    expect(formulaWithNamedTerms(roll)).toBe('1d20+3 +\u00a02\u00a0Stealth');
    expect(rollLine(roll)).toBe('1d20+3 +\u00a02\u00a0Stealth');
    // Dice labels are no constants.
    expect(formulaWithNamedTerms({ ...roll, formula: '2d6[fire]+2[Stealth]' })).toBe('2d6[fire] +\u00a02\u00a0Stealth');
  });

  it('keeps the formula where it does not end in the roll\'s labelled constants', () => {
    expect(formulaWithNamedTerms({ ...roll, formula: '1d20+5' })).toBe('1d20+5');
    expect(formulaWithNamedTerms({ ...roll, formula: '1d20+2[Stealth]+3' })).toBe('1d20+2[Stealth]+3');
  });

  it('writes a labelled constant as a formula holds it', () => {
    expect([labelledConstant({ label: 'Stealth', value: 2 }), labelledConstant({ label: 'Bane', value: -1 }), labelledConstant({ label: '', value: 3 })])
      .toEqual(['+2[Stealth]', '-1[Bane]', '+3']);
  });

  it('clicks in the plain modifier, then each labelled one', () => {
    expect(modifierSteps(roll, 'Modifier')).toEqual([{ label: 'Modifier', value: 3 }, { label: 'Stealth', value: 2 }]);
    expect(modifierSteps({ modifiers: 0, namedModifiers: [{ label: 'Luck', value: 0 }] }, 'Modifier')).toEqual([{ label: 'Luck', value: 0 }]);
    expect(modifierSteps({ modifiers: 5 }, 'Modifier')).toEqual([{ label: 'Modifier', value: 5 }]);
  });

  it('names the labelled ones after dice a set named', () => {
    const rolls = [{ value: 9, name: 'Hope' }, { value: 4, name: 'Fear' }];
    expect(namedDiceLine(rolls, { modifiers: 3, namedModifiers: [{ label: 'Survival', value: 2 }] }))
      .toBe('Hope 9 · Fear 4 + 1 + 2 Survival');
  });

  it('reads a saved log of an older version, and leaves out entries it cannot read', () => {
    expect(namedModifiersOf({ modifiers: 2 })).toEqual([]);
    const damaged = { modifiers: 4, namedModifiers: [{ label: 'Ok', value: 1 }, { label: '', value: 2 }, { label: 'NaN', value: Number.NaN }, null] };
    expect(namedModifiersOf(damaged as never)).toEqual([{ label: 'Ok', value: 1 }]);
    expect(modifiersText(damaged as never)).toBe(' + 3 + 1 Ok');
  });
});
