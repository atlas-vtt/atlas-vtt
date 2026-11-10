import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { rollTestFormula as rollFormula } from './rollTestFormula';
import { parseFormula } from '../parseFormula';
import { DiceTool } from '../DiceTool';
import { DEFAULT_DICE_RULES } from '../../gameSystems/diceRules';
const inputs = { random: Math.random, rollId: (): string => 'test-roll', roller: (): string => 'Player', onFormulaError: (): void => {} };

/** Rolls every die at its highest face. */
const highest = (): number => 0.999;

/** Rolls the faces given, in turn, on dice of the sides given. */
const faces = (...rolled: Array<[number, number]>) => {
  const queue = [...rolled];
  return (): number => {
    const [face, sides] = queue.shift() ?? [1, 2];
    return (face - 0.5) / sides;
  };
};

describe('keeping dice', () => {
  it('keeps the highest or lowest, marking the others dropped and leaving them out of the total', () => {
    const high = rollFormula('2d20kh1+2', faces([5, 20], [14, 20]));
    expect(high.rolls).toEqual([{ die: 'd20', value: 5, max: 20, dropped: true }, { die: 'd20', value: 14, max: 20 }]);
    expect(high.total).toBe(16);
    const low = rollFormula('4d6kl3', faces([6, 6], [2, 6], [3, 6], [5, 6]));
    expect(low.rolls.map((die) => die.dropped === true)).toEqual([true, false, false, false]);
    expect(low.total).toBe(10);
  });

  it('keeps the earlier of equal dice', () => {
    const tie = rollFormula('2d20kh1', faces([9, 20], [9, 20]));
    expect(tie.rolls.map((die) => die.dropped === true)).toEqual([false, true]);
  });

  it('keeps a subtracted term\'s best die and subtracts it', () => {
    expect(rollFormula('10-2d6kh1', faces([2, 6], [5, 6])).total).toBe(5);
  });
});

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
