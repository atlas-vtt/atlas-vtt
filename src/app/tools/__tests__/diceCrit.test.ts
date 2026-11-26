import { describe, it, expect } from 'vitest';
import { getDiceCrit } from '../diceCrit';
import type { RolledDie } from '../diceFormula';
import type { DiceRules } from '../../types/diceRulesTypes';

function die(sides: number, value: number, negative = false): RolledDie {
  return { die: `d${sides}`, value, max: sides, ...(negative && { negative: true as const }) };
}

const D20: DiceRules = { defaultRoll: '1d20', crit: 'natural' };

describe('getDiceCrit', () => {
  it('natural: a 20 on the default d20 is high, a 1 low, whatever the modifier', () => {
    expect(getDiceCrit([die(20, 20)], D20)).toBe('high');
    expect(getDiceCrit([die(20, 1)], D20)).toBe('low');
    expect(getDiceCrit([die(20, 15)], D20)).toBeNull();
  });

  it('only looks at the default dice', () => {
    expect(getDiceCrit([die(6, 6)], D20)).toBeNull();
    // The second d20 of 2d20 is not a default die of a 1d20 rule.
    expect(getDiceCrit([die(20, 10), die(20, 20)], D20)).toBeNull();
    expect(getDiceCrit([die(20, 20, true)], D20)).toBeNull();
  });

  it('is never critical for a mixed pool: only the default dice alone, with constants, can be', () => {
    expect(getDiceCrit([die(8, 8), die(20, 20)], D20)).toBeNull();
    expect(getDiceCrit([die(20, 1), die(4, 3)], D20)).toBeNull();
    expect(getDiceCrit([die(20, 20), die(4, 2, true)], D20)).toBeNull();
    const fate: RolledDie = { die: 'dF', value: 1, max: 1, min: -1 };
    expect(getDiceCrit([die(20, 20), fate], D20)).toBeNull();
    expect(getDiceCrit([die(12, 7), die(12, 7), die(6, 2)], { defaultRoll: '2d12', crit: 'doubles' })).toBeNull();
  });

  it('counts what the default die brings along as part of it: a dropped die, an exploded one, one rolled again, an advantage die', () => {
    expect(getDiceCrit([{ ...die(20, 4), dropped: true }, die(20, 20)], D20)).toBe('high');
    expect(getDiceCrit([{ ...die(20, 20), rerolled: true }, die(20, 1)], D20)).toBe('low');
    expect(getDiceCrit([die(20, 20), { ...die(6, 4), advantage: true }], D20)).toBe('high');
    const d10: DiceRules = { defaultRoll: '1d10', crit: 'natural' };
    expect(getDiceCrit([die(10, 10), { ...die(10, 7), exploded: true }], d10)).toBe('high');
  });

  it('roll-under: 01 is high and the highest face low', () => {
    const rules: DiceRules = { defaultRoll: '1d100', crit: 'roll-under' };
    expect(getDiceCrit([die(100, 1)], rules)).toBe('high');
    expect(getDiceCrit([die(100, 100)], rules)).toBe('low');
    expect(getDiceCrit([die(100, 50)], rules)).toBeNull();
  });

  it('doubles: matching default dice are high, never low', () => {
    const rules: DiceRules = { defaultRoll: '2d12', crit: 'doubles' };
    expect(getDiceCrit([die(12, 7), die(12, 7)], rules)).toBe('high');
    expect(getDiceCrit([die(12, 1), die(12, 1)], rules)).toBe('high');
    expect(getDiceCrit([die(12, 7), die(12, 3)], rules)).toBeNull();
    expect(getDiceCrit([die(12, 7)], rules)).toBeNull();
  });

  it('high-total: the highest total of the default dice or one below it is high, never low', () => {
    const rules: DiceRules = { defaultRoll: '2d10', crit: 'high-total' };
    expect(getDiceCrit([die(10, 10), die(10, 10)], rules)).toBe('high');
    expect(getDiceCrit([die(10, 10), die(10, 9)], rules)).toBe('high');
    expect(getDiceCrit([die(10, 9), die(10, 9)], rules)).toBeNull();
    expect(getDiceCrit([die(10, 1), die(10, 1)], rules)).toBeNull();
    // A third d10 is no default die of 2d10, and one d10 is too few.
    expect(getDiceCrit([die(10, 4), die(10, 5), die(10, 10)], rules)).toBeNull();
    expect(getDiceCrit([die(10, 10)], rules)).toBeNull();
    expect(getDiceCrit([die(20, 19)], { defaultRoll: '1d20', crit: 'high-total' })).toBe('high');
  });

  it('none: never critical', () => {
    expect(getDiceCrit([die(20, 20)], { defaultRoll: '1d20', crit: 'none' })).toBeNull();
  });
});
