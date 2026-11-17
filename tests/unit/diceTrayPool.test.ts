import { describe, expect, it } from 'vitest';
import {
  MAX_MODIFIER, clampModifier, diceCounts, formatModifier, readTray, trayDiceCount, writeTray,
} from '../../src/app/react/components/dice/diceTrayPool';
import { modifierOf, parseableFormula, withDie, withModifier } from '../../src/app/react/components/dice/diceTrayText';
import { readModifier } from '../../src/app/react/components/dice/DiceTrayModifier';

describe('dice tray pool', () => {
  it('writes the dice in ascending order, then the modifier with a true minus sign', () => {
    let text = '';
    for (const sides of [20, 6, 100, 6] as const) text = withDie(text, sides, 1);
    expect(text).toBe('2d6 + 1d20 + 1d100');
    expect(withModifier(text, 3)).toBe('2d6 + 1d20 + 1d100 + 3');
    expect(withModifier(text, -2)).toBe('2d6 + 1d20 + 1d100 − 2');
  });

  it('writes a modifier without dice on its own', () => {
    expect(writeTray({ pool: {}, modifier: 4 })).toBe('+4');
    expect(writeTray({ pool: { 8: 0 }, modifier: 0 })).toBe('');
    expect(formatModifier(-3)).toBe('−3');
  });

  it('reads plain dice and numbers as a pool, and anything else as a formula of its own', () => {
    expect(readTray('2d6+d20-3')).toEqual({ pool: { 6: 2, 20: 1 }, modifier: -3 });
    expect(readTray('1d20 − 1 + 4')).toEqual({ pool: { 20: 1 }, modifier: 3 });
    expect(readTray('4d6kh3')).toBeNull();
    expect(readTray('2d7')).toBeNull();
    expect(readTray('1d20 -1d4')).toBeNull();
    expect(readTray('1d20 +')).toBeNull();
  });

  it('counts the dice of each kind a formula rolls, its own terms too', () => {
    const counts = diceCounts('4d6kh3 + 2d6 + d20 + d% + 4d6d1');
    expect(counts).toEqual({ 6: 10, 20: 1, 100: 1 });
    expect(trayDiceCount(counts)).toBe(12);
    expect(diceCounts('1d100 + 1d10')).toEqual({ 100: 1, 10: 1 });
  });

  it('keeps the modifier within its range', () => {
    expect(clampModifier(250)).toBe(MAX_MODIFIER);
    expect(clampModifier(-250)).toBe(-MAX_MODIFIER);
  });
});

describe('dice tray text', () => {
  it('takes dice back one at a time and drops a term that has none left', () => {
    expect(withDie('2d6 + 1d20 + 3', 20, -1)).toBe('2d6 + 3');
    expect(withDie('1d8', 8, -1)).toBe('');
    expect(withDie('', 8, -1)).toBe('');
  });

  it('changes only the term of a typed formula a click changes', () => {
    expect(withDie('4d6kh3', 6, 1)).toBe('5d6kh3');
    expect(withDie('4d6kh3 + 2', 20, 1)).toBe('4d6kh3 + 1d20 + 2');
    expect(withDie('(1d8+2)*2', 4, 1)).toBe('(1d8+2)*2 + 1d4');
    expect(withDie('1d6kh1 + 3', 6, -1)).toBe('3');
    expect(withDie('4d6kh3 + 1d4', 4, -1)).toBe('4d6kh3');
    expect(withDie('4d6kh3', 20, -1)).toBe('4d6kh3');
    expect(withDie('1d100kh1', 10, 1)).toBe('1d100kh1 + 1d10');
  });

  it('reads and writes the modifier at the formula\'s end', () => {
    expect(modifierOf('4d6kh3 − 2')).toBe(-2);
    expect(modifierOf('+4')).toBe(4);
    expect(modifierOf('1d20')).toBe(0);
    expect(modifierOf('(1d8+2)*2')).toBe(0);
    expect(withModifier('4d6kh3 + 2', 5)).toBe('4d6kh3 + 5');
    expect(withModifier('4d6kh3 + 2', 0)).toBe('4d6kh3');
    expect(withModifier('+4', 0)).toBe('');
    expect(withModifier('(1d8+2)*2', -1)).toBe('(1d8+2)*2 − 1');
  });

  it('hands the parser hyphens', () => {
    expect(parseableFormula(' 1d20 − 2 ')).toBe('1d20 - 2');
  });

  it('reads a typed modifier and refuses anything else', () => {
    expect(readModifier('+5')).toBe(5);
    expect(readModifier('−2')).toBe(-2);
    expect(readModifier('-300')).toBe(-MAX_MODIFIER);
    expect(readModifier('two')).toBeNull();
    expect(readModifier('')).toBeNull();
  });
});
