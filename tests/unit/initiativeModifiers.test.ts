import { describe, expect, it } from 'vitest';
import { statblockInitiativeModifier } from '../../src/app/initiative/statblockModifiers';

describe('statblock initiative modifiers', () => {
  it.each([3, -2, 0, '+4', ' -3 '])('reads a signed whole number: %s', (value) => {
    expect(statblockInitiativeModifier({ modifier: value })).toBe(Number(value));
  });

  it('tries modifier before initiative, keeping an explicit zero', () => {
    expect(statblockInitiativeModifier({ initiative: '+3' })).toBe(3);
    expect(statblockInitiativeModifier({ modifier: 0, initiative: 3 })).toBe(0);
    expect(statblockInitiativeModifier({ modifier: 'unknown', initiative: -2 })).toBe(-2);
  });

  it('reads only the configured field, including nested paths and normalized names', () => {
    expect(statblockInitiativeModifier({ modifier: 9, combat: { 'Initiative Bonus': '-2' } }, ' combat.initiative_bonus ')).toBe(-2);
    expect(statblockInitiativeModifier({ modifier: 9, initiative: 3 }, 'missing')).toBe(0);
    expect(statblockInitiativeModifier({ bonuses: [0, 2] }, 'bonuses.1')).toBe(2);
  });

  it.each([undefined, null, true, {}, [], [3], 2.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '', '1d20+3', '3+2', '2.5', 'Infinity'])('does not interpret invalid values: %s', (value) => {
    expect(statblockInitiativeModifier({ modifier: value })).toBe(0);
  });
});
