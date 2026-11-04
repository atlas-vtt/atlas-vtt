import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { DiceTool } from '../DiceTool';
import { diceList, diceSum, dieLabel, dieStates } from '../diceLabels';
import type { RolledDie } from '../diceFormula';
import { DEFAULT_DICE_RULES } from '../../gameSystems/diceRules';
import { rollTestFormula as rollFormula } from './rollTestFormula';

function showing(sides: number, ...faces: number[]): () => number {
  let i = 0;
  return (): number => (faces[i++ % faces.length]! - 0.5) / sides;
}

const d = (sides: number, value: number, more: Partial<RolledDie> = {}): RolledDie => ({ die: `d${sides}`, value, max: sides, ...more });
const dF = (value: number): RolledDie => ({ die: 'dF', value, max: 1, min: -1 });

describe('diceSum', () => {
  it('writes old rolls as before', () => {
    expect(diceSum([d(6, 6), d(6, 6, { exploded: true }), d(6, 2, { exploded: true }), d(6, 3)])).toBe('6! + 6! + 2 + 3');
    expect(diceSum([d(10, 1), d(10, 7, { exploded: true, negative: true })])).toBe('1! − 7');
  });

  it('puts dropped dice in parentheses and joins a rerolled die to the die after it', () => {
    expect(diceSum(rollFormula('4d6kh3', showing(6, 3, 1, 6, 4)).rolls)).toBe('3 + (1) + 6 + 4');
    expect(diceSum(rollFormula('2d6r1', showing(6, 1, 5, 4)).rolls)).toBe('1→5 + 4');
    expect(diceSum(rollFormula('1d6-1d6rr1', showing(6, 3, 1, 1, 2)).rolls)).toBe('3 − 1→1→2');
  });

  it('adds Fate dice by their numbers', () => {
    expect(diceSum([dF(1), dF(0), dF(-1), dF(1)])).toBe('1 + 0 − 1 + 1');
    expect(diceSum([dF(-1), dF(1)])).toBe('−1 + 1');
  });

  it('names a labelled run of dice once, after its last die', () => {
    expect(diceSum(rollFormula('2d4[fire]+1d4[cold]+1d4', showing(4, 4, 3, 2, 1)).rolls)).toBe('4 + 3 [fire] + 2 [cold] + 1');
  });
});

describe('diceList', () => {
  it('lists the dice of a formula that is no sum, with their marks', () => {
    expect(diceList(rollFormula('4d10x>=10cs>=8', showing(10, 10, 9, 3, 8, 1)).rolls)).toBe('10!✓, 9✓, 3, 8✓, 1');
    expect(diceList(rollFormula('3d6cf<=2', showing(6, 1, 5, 2)).rolls)).toBe('1✗, 5, 2✗');
    expect(diceList([dF(1), dF(-1), dF(0)])).toBe('+, −, 0');
    expect(diceList(rollFormula('2d6r1kh1*2', showing(6, 1, 3, 5)).rolls)).toBe('1→(3), 5');
  });
});

describe('dieLabel', () => {
  it('shows each die with its term, its label and its marks', () => {
    const rolls = rollFormula('4d6r1kh3[fire]', showing(6, 1, 2, 3, 4, 5)).rolls;
    expect(rolls.map((_, i) => dieLabel(rolls, i))).toEqual(['d6[fire]: 1→', 'd6[fire]: (2)', 'd6[fire]: 3', 'd6[fire]: 4', 'd6[fire]: 5']);
    expect(dieLabel([dF(1), dF(-1), dF(0)], 1)).toBe('dF: −');
    expect(dieLabel([d(10, 1), d(10, 7, { exploded: true, negative: true })], 1)).toBe('−d10: 7');
  });
});

describe('dieStates', () => {
  it('highlights highest and lowest faces only on dice that count', () => {
    expect(dieStates(d(20, 20))).toEqual(['max']);
    expect(dieStates(d(20, 1))).toEqual(['min']);
    expect(dieStates(d(20, 20, { dropped: true }))).toEqual(['dropped']);
    expect(dieStates(d(6, 1, { rerolled: true }))).toEqual(['rerolled']);
    expect(dieStates(d(10, 10, { success: true }))).toEqual(['max', 'success']);
    expect(dieStates(d(10, 1, { failure: true }))).toEqual(['min', 'failure']);
    expect(dieStates(dF(-1))).toEqual(['min']);
    expect(dieStates(dF(0))).toEqual([]);
  });
});

describe('DiceTool with the full notation', () => {
  const inputs = (random: () => number) => ({ random, rollId: (): string => 'roll', roller: (): string => 'Mira', onFormulaError: (): void => {} });

  it('rolls formulas that are no plain sum and says so', () => {
    const tool = new DiceTool(new EventEmitter(), () => DEFAULT_DICE_RULES, inputs(showing(6, 4)));
    expect(tool.rollDice('1d6*2+1')).toMatchObject({ total: 9, modifiers: 0, linear: false });
    expect(tool.rollDice('1d6+1')).not.toHaveProperty('linear');
  });

  it('completes a bonus without dice, labels kept whole, and never a formula with dice', () => {
    const tool = new DiceTool(new EventEmitter(), () => DEFAULT_DICE_RULES, inputs(showing(20, 10)));
    expect(tool.rollDice('+ 3[magic bonus]')?.formula).toBe('1d20+3[magic bonus]');
    expect(tool.rollDice('2*3')).toMatchObject({ formula: '1d20+2*3', total: 16 });
    expect(tool.rollDice('2d20kh1')?.formula).toBe('2d20kh1');
  });
});
