import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import {
  DICE_TYPES, DiceFormulaError, diceFormula, diceTerms, persistableDiceLog, rollByRules, rollerName, rollFormula, withoutHiddenToken, type DiceRollResult,
} from '../../src/app/tools/diceRolling';
import type { DiceRules } from '../../src/app/types/diceRulesTypes';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { offlineDiceInputs } from '../../src/app/services/offlineDiceInputs';

/** Returns `values` in turn, over and over, as `Math.random` would. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe('dice formulas', () => {
  it('lists the dice of the tray in tray order', () => {
    expect(DICE_TYPES).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
  });

  it('writes a selection in the order it was picked, as the dice tray does', () => {
    expect(diceTerms({ d20: 1, d6: 2 })).toEqual(['d20', '2d6']);
    expect(diceTerms({ d4: 0, d8: 1 })).toEqual(['d8']);
    expect(diceFormula({ d6: 2, d20: 1 })).toBe('2d6+d20');
    expect(diceFormula({ d8: 3 }, 4)).toBe('3d8+4');
    expect(diceFormula({ d8: 3 }, -2)).toBe('3d8-2');
    expect(diceFormula({}, 5)).toBe('');
  });
});

describe('rollFormula', () => {
  it('rolls each die and adds the modifier', () => {
    // floor(0.5 × 20) + 1 = 11.
    const result = rollFormula('1d20+5', sequence(0.5), 1000);
    expect(result.rolls).toEqual([{ die: 'd20', value: 11, max: 20 }]);
    expect(result).toMatchObject({ formula: '1d20+5', modifiers: 5, total: 16, timestamp: 1000 });
  });

  it('reads a count before a second die as dice, not as a modifier', () => {
    const result = rollFormula('2d6+3d8+1', sequence(0), 0);
    expect(result.rolls.map((roll) => roll.die)).toEqual(['d6', 'd6', 'd8', 'd8', 'd8']);
    expect(result.modifiers).toBe(1);
    expect(result.total).toBe(6);
  });

  it('reads spaced and negative modifiers, and dice without a count', () => {
    const result = rollFormula('d20 + 2 - 5', sequence(0), 0);
    expect(result.rolls).toEqual([{ die: 'd20', value: 1, max: 20 }]);
    expect(result.modifiers).toBe(-3);
    expect(result.total).toBe(-2);
  });

  it('is what DiceTool rolls', () => {
    const tool = new DiceTool(new EventEmitter(), () => DEFAULT_DICE_RULES, offlineDiceInputs());
    const result = tool.rollDice('2d6+3d8')!;
    expect(result.rolls).toHaveLength(5);
    expect(result.modifiers).toBe(0);
    expect(tool.getQuickDice()).toEqual([...DICE_TYPES]);
  });
});

describe('rolling by the dice rules of a collection', () => {
  const d20Rules: DiceRules = { defaultRoll: '1d20', crit: 'natural' };
  const exploding: DiceRules = { defaultRoll: '1d20', crit: 'natural', explode: { dice: 'all', repeats: false, highFaces: 1, lowFaces: 0 } };

  it('decides the critical result by the critical rule', () => {
    expect(rollFormula('1d20', sequence(0.99), 0, d20Rules).crit).toBe('high');
    expect(rollFormula('1d20', sequence(0), 0, d20Rules).crit).toBe('low');
    expect(rollFormula('1d20', sequence(0.5), 0, d20Rules).crit).toBeNull();
    expect(rollFormula('1d20', sequence(0.99), 0, { ...d20Rules, crit: 'none' }).crit).toBeNull();
    expect(rollFormula('1d20', sequence(0.99), 0).crit).toBeUndefined();
  });

  it('rolls a die again when it shows its highest face and adds the new die', () => {
    // 0.99 is a 6, which explodes; 0.5 then rolls a 4.
    const result = rollFormula('1d6', sequence(0.99, 0.5), 0, exploding);
    expect(result.rolls).toEqual([
      { die: 'd6', value: 6, max: 6 },
      { die: 'd6', value: 4, max: 6, exploded: true },
    ]);
    expect(result.total).toBe(10);
    expect(rollFormula('1d6', sequence(0.99, 0.5), 0).rolls).toHaveLength(1);
  });
});

describe('what players see of a roll', () => {
  const statblock: DiceRollResult = {
    id: 'r', timestamp: 0, formula: 'd20', rolls: [], modifiers: 0, total: 1,
    source: { type: 'statblock', tokenId: 'gob', tokenName: 'Goblin', abilityName: 'Scimitar' },
  };

  it('drops the token of a roll for a hidden token, and keeps the ability', () => {
    expect(withoutHiddenToken(statblock, () => true).source).toEqual({ type: 'statblock', abilityName: 'Scimitar' });
    expect(withoutHiddenToken(statblock, () => false)).toBe(statblock);
  });

  it('names who rolled it, else the statblock token, else nobody', () => {
    expect(rollerName({ ...statblock, rolledBy: 'Anna' })).toBe('Anna');
    expect(rollerName(statblock)).toBe('Goblin');
    expect(rollerName(withoutHiddenToken(statblock, () => true))).toBeNull();
    expect(rollerName({ ...statblock, source: { type: 'toolbar' } })).toBeNull();
  });
});

describe('what the dice log saves', () => {
  it("keeps the GM's rolls and leaves rolls by others in memory", () => {
    const gm = rollFormula('d20');
    const player = { ...rollFormula('d6'), rolledBy: 'Anna' };
    expect(persistableDiceLog([player, gm])).toEqual([gm]);
  });
});

describe('formulas Atlas does not roll (#275)', () => {
  const rules: DiceRules = { defaultRoll: '1d20', crit: 'natural' };

  it('refuses them before any die is rolled, saying why', () => {
    const random = (): number => { throw new Error('rolled'); };
    const refused = (formula: string): string => {
      try {
        rollFormula(formula, random, 0);
      } catch (error) {
        expect(error).toBeInstanceOf(DiceFormulaError);
        return (error as DiceFormulaError).code;
      }
      throw new Error(`${formula} was rolled`);
    };
    expect(refused('1d20 plus 3')).toBe('syntax');
    expect(refused('')).toBe('syntax');
    expect(refused('x'.repeat(65))).toBe('length');
    expect(refused(Array.from({ length: 11 }, () => '1').join('+'))).toBe('terms');
    expect(refused('101d6')).toBe('dice');
    expect(refused('1d1001')).toBe('faces');
    expect(refused('1d1')).toBe('faces');
  });

  it("rolls the tray's own formulas as before", () => {
    expect(rollFormula(diceFormula({ d6: 20, d8: 20, d10: 20, d12: 20, d20: 20 }, -9999), sequence(0.5), 0).rolls).toHaveLength(100);
  });

  it('completes a bonus to the default roll as the tray does, and checks the bonus as given', () => {
    expect(rollByRules('', rules, sequence(0.5), 0).formula).toBe('1d20');
    expect(rollByRules('+3', rules, sequence(0.5), 0).formula).toBe('1d20+3');
    expect(rollByRules('3', rules, sequence(0.5), 0).formula).toBe('1d20+3');
    expect(() => rollByRules('+3 and more', rules)).toThrow(DiceFormulaError);
    expect(() => rollByRules('+3', { ...rules, defaultRoll: '1d0' })).toThrow(DiceFormulaError);
  });
});
