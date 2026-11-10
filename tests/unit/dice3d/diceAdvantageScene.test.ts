import { describe, expect, it } from 'vitest';
import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import { hasBreakdown, rollBreakdown } from '../../../src/app/react/components/dice3d/diceRollText';
import type { RolledDie } from '../../../src/app/tools/diceFormula';
import type { DiceRollResult } from '../../../src/app/types/diceTypes';

function result(rolls: RolledDie[], modifiers: number, advantage?: DiceRollResult['advantage']): DiceRollResult {
  const total = rolls.reduce((sum, roll) => (roll.dropped ? sum : sum + (roll.negative ? -roll.value : roll.value)), 0) + modifiers;
  return { id: 'r', timestamp: 0, formula: '1d20+5', rolls, modifiers, total, ...(advantage && { advantage }) };
}

describe('a roll that dropped dice, on the stage', () => {
  it('throws the dropped die with the others and marks it to fade', () => {
    const scene = sceneFromRolls([{ die: 'd20', value: 4, max: 20, dropped: true }, { die: 'd20', value: 17, max: 20 }])!;
    expect(scene.plan.map((die) => die.dropped === true)).toEqual([true, false]);
    expect(scene.faces).toEqual([4, 17]);
  });

  it('throws the die disadvantage subtracts', () => {
    const scene = sceneFromRolls([{ die: 'd12', value: 7, max: 12 }, { die: 'd6', value: 3, max: 6, negative: true, advantage: true }])!;
    expect(scene.plan[1]).toMatchObject({ sides: 6, subtracts: true });
    expect(scene.plan[1]?.follows).toBeUndefined();
    // Any other subtracted die still shows as a card.
    expect(sceneFromRolls([{ die: 'd12', value: 7, max: 12 }, { die: 'd6', value: 3, max: 6, negative: true }])).toBeNull();
  });

  it('throws a bonus die as a tens die alone beside the d100 whose units it shares, which never fade', () => {
    const scene = sceneFromRolls([
      { die: 'd100', value: 47, max: 100, dropped: true },
      { die: 'd100', value: 27, max: 100, sharedUnits: true },
    ])!;
    expect(scene.plan.map((die) => [die.role, die.dropped === true])).toEqual([['tens', true], ['units', false], ['tens', false]]);
    expect(scene.faces).toEqual([4, 7, 2]);
  });

  it('throws two whole d100s when one is dropped, and none when both count', () => {
    const scene = sceneFromRolls([{ die: 'd100', value: 47, max: 100 }, { die: 'd100', value: 83, max: 100, dropped: true }])!;
    expect(scene.plan.map((die) => [die.role, die.dropped === true])).toEqual([['tens', false], ['units', false], ['tens', true], ['units', true]]);
    expect(sceneFromRolls([{ die: 'd100', value: 47, max: 100 }, { die: 'd100', value: 83, max: 100 }])).toBeNull();
  });

  it('names the side under the total and sums the kept dice only', () => {
    const roll = result([{ die: 'd20', value: 4, max: 20, dropped: true }, { die: 'd20', value: 17, max: 20 }], 5, 'advantage');
    const scene = sceneFromRolls(roll.rolls)!;
    expect(rollBreakdown(roll, scene)).toBe('Advantage · 17 + 5');
    expect(hasBreakdown(roll, scene)).toBe(true);
    const bare = result([{ die: 'd20', value: 4, max: 20 }, { die: 'd20', value: 17, max: 20, dropped: true }], 0, 'disadvantage');
    expect(rollBreakdown(bare, sceneFromRolls(bare.rolls)!)).toBe('Disadvantage');
    const percentile = result([{ die: 'd100', value: 47, max: 100, dropped: true }, { die: 'd100', value: 27, max: 100, sharedUnits: true }], 0, 'advantage');
    expect(rollBreakdown(percentile, sceneFromRolls(percentile.rolls)!)).toBe('Advantage · Tens 20, units 7');
  });
});
