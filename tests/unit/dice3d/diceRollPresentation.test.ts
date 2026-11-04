import { describe, expect, it } from 'vitest';
import { diceSceneToShow } from '../../../src/app/dice3d/rollPresentation';
import { isDiceDisplay, throwStyle } from '../../../src/app/dice3d/diceDisplay';
import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import { closeAllRolls, closeRoll, dismissRoll, largeRollIndex, pushRoll, type StackedRoll } from '../../../src/app/react/components/dice3d/rollStackState';
import { rollBreakdown, rollLabel } from '../../../src/app/react/components/dice3d/diceRollText';
import type { DiceRollResult } from '../../../src/app/types/diceTypes';

function result(id: string, rolls: DiceRollResult['rolls'], modifiers = 0, source?: DiceRollResult['source']): DiceRollResult {
  const total = rolls.reduce((sum, roll) => sum + (roll.negative ? -roll.value : roll.value), 0) + modifiers;
  return { id, timestamp: 0, formula: '', rolls, modifiers, total, ...(source && { source }) };
}

const d20 = (value: number): DiceRollResult['rolls'][number] => ({ die: 'd20', value, max: 20 });

function stacked(id: string): StackedRoll {
  const roll = result(id, [d20(10)]);
  return { result: roll, scene: sceneFromRolls(roll.rolls)!, style: throwStyle('full') };
}

describe('diceSceneToShow', () => {
  it('throws real bodies only while 3D dice are on', () => {
    const roll = result('a', [d20(12)]);
    expect(diceSceneToShow(roll, 'full')?.faces).toEqual([12]);
    expect(diceSceneToShow(roll, 'card')).toBeNull();
    expect(diceSceneToShow(result('b', [{ die: 'd7', value: 3, max: 7 }]), 'fast')).toBeNull();
  });
});

describe('roll stack', () => {
  it('keeps three standing rolls and lets older ones leave', () => {
    let rolls: readonly StackedRoll[] = [];
    for (const id of ['a', 'b', 'c', 'd']) rolls = pushRoll(rolls, stacked(id));
    expect(rolls.map((roll) => [roll.result.id, roll.leaving === true])).toEqual([
      ['a', true], ['b', false], ['c', false], ['d', false],
    ]);
    expect(largeRollIndex(rolls)).toBe(3);
  });

  it('fades a roll out before removing it, and removes only that one', () => {
    let rolls: readonly StackedRoll[] = [stacked('a'), stacked('b')];
    rolls = closeRoll(rolls, 'b');
    expect(rolls[1]?.leaving).toBe(true);
    // The last roll leaving keeps the large place instead of shrinking as it goes.
    expect(largeRollIndex(rolls)).toBe(0);
    rolls = dismissRoll(rolls, 'b');
    expect(rolls.map((roll) => roll.result.id)).toEqual(['a']);
    expect(dismissRoll(rolls, 'missing')).toBe(rolls);
  });
});

describe('closing every roll', () => {
  it('lets all standing rolls fade out and leaves a quiet stack alone', () => {
    const rolls = closeAllRolls([stacked('a'), { ...stacked('b'), leaving: true }]);
    expect(rolls.every((roll) => roll.leaving)).toBe(true);
    expect(closeAllRolls(rolls)).toBe(rolls);
  });
});

describe('panel text', () => {
  it('names the action, never the creature: its portrait says who rolled', () => {
    expect(rollLabel(result('a', [d20(3)], 0, { type: 'statblock', tokenName: 'Goblin', abilityName: 'Scimitar' }))).toBe('Scimitar');
    expect(rollLabel(result('a', [d20(3)], 0, { type: 'statblock', tokenName: 'Goblin' }))).toBe('Roll');
    expect(rollLabel(result('a', [d20(3)]))).toBe('Roll');
  });

  it('writes out a chain of exploded dice, and a die that subtracts', () => {
    const d6 = (value: number, more: object = {}): DiceRollResult['rolls'][number] => ({ die: 'd6', value, max: 6, ...more });
    const aces = result('a', [d6(6), d6(6, { exploded: true }), d6(2, { exploded: true }), d6(3)], 2);
    expect(rollBreakdown(aces, sceneFromRolls(aces.rolls)!)).toBe('6! + 6! + 2 + 3 + 2');

    const fumble = result('b', [{ die: 'd10', value: 1, max: 10 }, { die: 'd10', value: 7, max: 10, exploded: true, negative: true }], 4);
    expect(fumble.total).toBe(-2);
    expect(rollBreakdown(fumble, sceneFromRolls(fumble.rolls)!)).toBe('1! − 7 + 4');
  });

  it('breaks the total down', () => {
    const attack = result('a', [d20(14)], 5);
    expect(rollBreakdown(attack, sceneFromRolls(attack.rolls)!)).toBe('14 + 5');
    const single = result('b', [d20(14)]);
    expect(rollBreakdown(single, sceneFromRolls(single.rolls)!)).toBeNull();
    const percentile = result('c', [{ die: 'd100', value: 37, max: 100 }], -2);
    expect(rollBreakdown(percentile, sceneFromRolls(percentile.rolls)!)).toBe('Tens 30, units 7 − 2');
    const coin = result('d', [{ die: 'd2', value: 2, max: 2 }]);
    expect(rollBreakdown(coin, sceneFromRolls(coin.rolls)!)).toBe('6 on the d6 counts 2');
    const handful = result('e', Array.from({ length: 8 }, () => ({ die: 'd6', value: 3, max: 6 })));
    expect(rollBreakdown(handful, sceneFromRolls(handful.rolls)!)).toBe('8 dice, 24');
  });
});

describe('dice display', () => {
  it('plays fast dice at double speed with at most three wall hits', () => {
    expect(throwStyle('fast')).toEqual({ speed: 2, maxWallHits: 3 });
    expect(throwStyle('full')).toEqual({ speed: 1, maxWallHits: Infinity });
    expect(isDiceDisplay('fast')).toBe(true);
    expect(isDiceDisplay(true)).toBe(false);
  });
});
