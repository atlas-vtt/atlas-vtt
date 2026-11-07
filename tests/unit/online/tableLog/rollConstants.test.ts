import { describe, expect, it } from 'vitest';
import { constantChips, formulaLine } from '../../../../src/app/online/tableLog/rollDice';

describe('the constants of a roll in the log', () => {
  it('chip the unnamed sum where it is not 0, then each named one', () => {
    expect(constantChips({ modifiers: 3, namedModifiers: [{ label: 'Str mod', value: -1 }] })).toEqual(['+4', '−1 Str mod']);
    expect(constantChips({ modifiers: -1, namedModifiers: [{ label: 'Str mod', value: -1 }] })).toEqual(['−1 Str mod']);
    expect(constantChips({ modifiers: -2 })).toEqual(['−2']);
  });

  it('write each named constant of the formula as a term of its own, and a label of dice as it is', () => {
    expect(formulaLine({ formula: '1d20+4-1[Str mod]', namedModifiers: [{ label: 'Str mod', value: -1 }] })).toBe('1d20+4 − 1 Str mod');
    expect(formulaLine({ formula: '2d6[fire]+3[Agi]', namedModifiers: [{ label: 'Agi', value: 3 }] })).toBe('2d6[fire] + 3 Agi');
    expect(formulaLine({ formula: '1d20+3[Str]' })).toBe('1d20+3[Str]');
  });
});
