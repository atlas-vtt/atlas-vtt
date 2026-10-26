import { describe, expect, it } from 'vitest';
import { isDiceValue, rollsWithReferences } from '../../../../src/app/statblocks/values/diceValues';

describe('a Dice value', () => {
  it('rolls where its whole text is one roll by the text-roll rule', () => {
    for (const text of ['2d6+2', '7d10 + 14', 'd20', '(2d6 + 3)', '1d4 − 1', '+4', '+4+1', '3d6kh2+1']) expect(isDiceValue(text), text).toBe(true);
    for (const text of ['14', '4+1', 'two dice', '1d6 fire', '101d6', '1d0', '']) expect(isDiceValue(text), text).toBe(false);
  });

  it('rolls with its references only where each names a number', () => {
    const lookup = (path: string): number | undefined => ({ str: 3, agi: 2, 'str.mod': 1, level: 500 })[path];
    for (const text of ['1d8+@str', '+4+@agi', '2d8 + @str.mod']) expect(rollsWithReferences(text, lookup), text).toBe(true);
    // A reference that names nothing, and one whose number takes the roll past the parser's limits.
    for (const text of ['1d8+@nope', '@level d6']) expect(rollsWithReferences(text, lookup), text).toBe(false);
  });
});
