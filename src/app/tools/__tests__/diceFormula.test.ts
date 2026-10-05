import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { rollTestFormula as rollFormula } from './rollTestFormula';
import { parseFormula } from '../parseFormula';
import { DiceTool } from '../DiceTool';
import { DEFAULT_DICE_RULES } from '../../gameSystems/diceRules';
const inputs = { random: Math.random, rollId: (): string => 'test-roll', roller: (): string => 'Player', onFormulaError: (): void => {} };

/** Rolls every die at its highest face. */
const highest = (): number => 0.999;

describe('rollFormula', () => {
  it('reads a signed dice term as dice, not as a modifier', () => {
    const result = rollFormula('d20+2d6', highest);
    expect(result.rolls.map((r) => r.die)).toEqual(['d20', 'd6', 'd6']);
    expect(result.modifiers).toBe(0);
    expect(result.total).toBe(32);
  });

  it('subtracts dice of a minus term', () => {
    const result = rollFormula('2d6-1d4', highest);
    expect(result.rolls[2]).toEqual({ die: 'd4', value: 4, max: 4, negative: true });
    expect(result.total).toBe(8);
  });

  it('adds constants as modifiers', () => {
    const result = rollFormula('1d8 + 1d6 + 3 - 1', highest);
    expect(result.modifiers).toBe(2);
    expect(result.total).toBe(16);
  });

  it('rolls nothing for text without dice', () => {
    expect(rollFormula('+3').rolls).toEqual([]);
    expect(parseFormula('d1+2')).toEqual({ ok: false, code: 'faces' });
  });
});

describe('DiceTool bare bonuses', () => {
  it('adds a bare bonus to the collection default roll and records its crit', () => {
    const tool = new DiceTool(new EventEmitter(), () => ({ defaultRoll: '2d12', crit: 'doubles' }), inputs);
    const result = tool.rollDice('+3')!;
    expect(result.formula).toBe('2d12+3');
    expect(result.rolls.map((r) => r.die)).toEqual(['d12', 'd12']);
    expect(result.crit === 'high').toBe(result.rolls[0]!.value === result.rolls[1]!.value);
  });

  it('reads a bare number as a bonus', () => {
    expect(new DiceTool(new EventEmitter(), () => DEFAULT_DICE_RULES, inputs).rollDice('4')?.formula).toBe('1d20+4');
    expect(new DiceTool(new EventEmitter(), () => DEFAULT_DICE_RULES, inputs).rollDice('-1')?.formula).toBe('1d20-1');
  });
});
