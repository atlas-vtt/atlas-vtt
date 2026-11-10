import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { rollPieces, writtenRoll } from '../../src/app/tools/textRolls';
import { DiceTool, type DiceRollInputs } from '../../src/app/tools/DiceTool';
import type { DiceRules } from '../../src/app/types/diceRulesTypes';

/** The rolls a text holds: what stands there, and the formula it throws. */
const rolls = (text: string): [string, string][] =>
  rollPieces(text).flatMap((piece) => (piece.formula === null ? [] : [[piece.text, piece.formula] as [string, string]]));

describe('a text written as one roll', () => {
  it.each([
    ['+2', '+2'],
    ['+4+1', '+4+1'],
    ['+4 + 1', '+4+1'],
    ['+4 + 1 - 2', '+4+1-2'],
    ['-1+2', '-1+2'],
    ['−1', '-1'],
    ['+2*3', '+2*3'],
    ['2d8+2', '2d8+2'],
    ['2d8 + 1', '2d8+1'],
    ['1d20+3', '1d20+3'],
    ['d20', 'd20'],
    ['D12', 'D12'],
    ['+2d6', '+2d6'],
    ['3d6kh2+1', '3d6kh2+1'],
    ['4d6r1kh3', '4d6r1kh3'],
    ['8d10x>=10cs>=8', '8d10x>=10cs>=8'],
    ['4dF+1', '4dF+1'],
    ['d%', 'd%'],
    ['2d6[fire damage] + 3', '2d6[fire damage]+3'],
    ['3d6 + -1', '3d6-1'],
    ['1d6 × 10', '1d6*10'],
    ['2 + 1d6', '2+1d6'],
    ['(1d8+2)*2', '(1d8+2)*2'],
    ['ATK: +4', '+4'],
  ])('rolls %s as %s', (text, formula) => {
    expect(rolls(text)).toEqual([[text, formula]]);
  });

  it.each(['3', '4+1', '2 + 3', 'x2', '5d', '1d0', '101d6', '1d20+10000', '+1.5', '*2', '1d6/0', ''])('rolls nothing for %j', (text) => {
    expect(rolls(text)).toEqual([]);
    expect(writtenRoll(text)).toBeNull();
  });

  it('keeps the spaces around a whole value as words', () => {
    expect(rollPieces(' 2 + 1d6 ')).toEqual([{ text: ' ', formula: null }, { text: '2 + 1d6', formula: '2+1d6' }, { text: ' ', formula: null }]);
  });
});

describe('the rolls of running text', () => {
  it('finds none in the numbers of sentences', () => {
    for (const text of [
      'Ten years ago 3 goblins took 2 horses.',
      'Recharge 5-6, levels 1–3, CR 1/4, 30 ft., 1 + 1, 2026-10-22',
      'It weighs +1.5 lb and has a +5ft reach; hd6 and x2d6 are no dice.',
      'Level 3 rogue, 2 attacks per turn',
    ]) expect(rolls(text), text).toEqual([]);
  });

  it('takes a sum of numbers after a sign as one bonus', () => {
    expect(rolls('Test Experience 3: +4+1, Never backs down +2')).toEqual([['+4+1', '+4+1'], ['+2', '+2']]);
    expect(rolls('Agility −1, Finesse +2')).toEqual([['−1', '-1'], ['+2', '+2']]);
  });

  it('takes a bonus and the dice after it as one roll, and a spaced dash as punctuation', () => {
    expect(rolls('Sneak +2 + 1d6 more')).toEqual([['+2 + 1d6', '+2+1d6']]);
    expect(rolls('Claws - Very Close - 1d12+2 phy')).toEqual([['1d12+2', '1d12+2']]);
    expect(rolls('Hit: 19 (2d10 + 8) slashing, then 1d4 * 10 gp')).toEqual([['2d10 + 8', '2d10+8'], ['1d4 * 10', '1d4*10']]);
  });

  it('reads a value of one roll and other numbers term by term, not whole', () => {
    expect(rolls('1d6 2')).toEqual([['1d6', '1d6']]);
    expect(rolls('Hit: 7 (2d6) slashing')).toEqual([['2d6', '2d6']]);
  });

  it('rolls nothing past the limits a formula may have', () => {
    expect(rolls('Meteor 101d6, then 1d1001, then 1d6')).toEqual([['1d6', '1d6']]);
  });
});

describe('a bonus written as a sum, rolled by the dice tool', () => {
  const d20: DiceRules = { defaultRoll: '1d20', crit: 'natural' };
  const inputs = (face: number): DiceRollInputs => ({ random: () => (face - 0.5) / 20, rollId: () => 'roll', roller: () => 'GM', onFormulaError: vi.fn() });

  it('adds the whole sum to the set\'s dice, as it adds a single bonus', () => {
    const result = new DiceTool(new EventEmitter(), () => d20, inputs(7)).rollDice('+4+1')!;
    expect(result).toMatchObject({ formula: '1d20+4+1', modifiers: 5, total: 12 });
    expect(new DiceTool(new EventEmitter(), () => d20, inputs(7)).rollDice('+5')).toMatchObject({ formula: '1d20+5', modifiers: 5, total: 12 });
  });

  it('keeps the set\'s critical rule: only the d20 decides it', () => {
    expect(new DiceTool(new EventEmitter(), () => d20, inputs(20)).rollDice('+4+1')?.crit).toBe('high');
    expect(new DiceTool(new EventEmitter(), () => d20, inputs(1)).rollDice('-1+2')?.crit).toBe('low');
    expect(new DiceTool(new EventEmitter(), () => d20, inputs(10)).rollDice('+2*3')).toMatchObject({ formula: '1d20+2*3', total: 16 });
  });
});
