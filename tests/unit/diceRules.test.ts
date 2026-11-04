import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { DEFAULT_DICE_RULES, isValidDefaultRoll, parseExplodeRule, sameDiceRules, withExplodeScope } from '../../src/app/gameSystems/diceRules';
import { collectionDiceSet } from '../../src/app/gameSystems/diceSetResolution';
import { parseUserPresets } from '../../src/app/gameSystems/presetValidation';
import { describeExplodeRule, highFaceNames, lowFaceNames } from '../../src/app/gameSystems/explodeRuleText';
import { defaultDiceExplanation } from '../../src/app/react/components/collection-settings/DefaultDiceInfo';
import { sameSystemRules } from '../../src/app/gameSystems/systemRules';

const cthulhu = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:coc7e')!;

describe('a collection\'s dice', () => {
  it('are its own stored rules first', () => {
    const own = { defaultRoll: '2d12', crit: 'doubles' as const };
    expect(collectionDiceSet({ dice: own, systemPresetId: cthulhu.id }, BUILT_IN_SYSTEM_PRESETS, [])).toMatchObject({ dice: [{ count: 2, sides: 12 }], crit: 'doubles' });
  });

  it('fall back to the recorded preset, then to the default', () => {
    expect(collectionDiceSet({ systemPresetId: cthulhu.id }, BUILT_IN_SYSTEM_PRESETS, [])).toMatchObject({ dice: [{ count: 1, sides: 100 }], crit: 'roll-under' });
    expect(collectionDiceSet({ systemPresetId: 'deleted' }, BUILT_IN_SYSTEM_PRESETS, [])).toMatchObject({ dice: [{ count: 1, sides: 20 }], crit: DEFAULT_DICE_RULES.crit });
  });
});

describe('isValidDefaultRoll', () => {
  it('accepts one dice group', () => {
    expect(['1d20', '2d12', 'd100', ' 3d6 '].every(isValidDefaultRoll)).toBe(true);
    expect(['', '1d1', '0d6', '1d20+2', '2d6+1d4', 'd'].some(isValidDefaultRoll)).toBe(false);
  });
});

describe('dice in system rules', () => {
  it('counts missing dice as the default when comparing', () => {
    const { dice, diceSetId: _set, ...withoutDice } = structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules);
    expect(dice).toEqual(DEFAULT_DICE_RULES);
    expect(sameSystemRules(withoutDice, { ...withoutDice, dice: { ...DEFAULT_DICE_RULES } })).toBe(true);
    expect(sameSystemRules(withoutDice, { ...withoutDice, dice: { defaultRoll: '1d20', crit: 'none' } })).toBe(false);
  });

  it('keeps valid dice of stored presets and drops invalid ones', () => {
    const preset = (dice: unknown): unknown => ({
      id: `p-${JSON.stringify(dice)}`,
      name: `P ${JSON.stringify(dice)}`,
      rules: { gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [], dice },
    });
    const [valid, badRoll, badRule] = parseUserPresets([
      preset({ defaultRoll: ' 2d12 ', crit: 'doubles' }),
      preset({ defaultRoll: '2d', crit: 'doubles' }),
      preset({ defaultRoll: '1d20', crit: 'sometimes' }),
    ]);
    expect(valid!.rules.dice).toEqual({ defaultRoll: '2d12', crit: 'doubles' });
    expect(badRoll!.rules.dice).toBeUndefined();
    expect(badRule!.rules.dice).toBeUndefined();
  });
});

describe('exploding dice rules', () => {
  const aces = { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 } as const;

  it('reads a stored rule and drops what is no rule', () => {
    expect(parseExplodeRule(aces)).toEqual(aces);
    expect(parseExplodeRule({ dice: 'default', repeats: false, highFaces: 2, lowFaces: 1, more: true })).toEqual({ dice: 'default', repeats: false, highFaces: 2, lowFaces: 1 });
    for (const broken of [undefined, null, 'all', { ...aces, dice: 'some' }, { ...aces, repeats: 'yes' }, { ...aces, highFaces: 0 }, { ...aces, highFaces: 1.5 }, { ...aces, lowFaces: -1 }]) {
      expect(parseExplodeRule(broken)).toBeNull();
    }
  });

  it('compares dice rules by their exploding rule too', () => {
    const base = { defaultRoll: '1d10', crit: 'natural' as const };
    expect(sameDiceRules(base, { ...base })).toBe(true);
    expect(sameDiceRules(base, { ...base, explode: aces })).toBe(false);
    expect(sameDiceRules({ ...base, explode: { ...aces } }, { ...base, explode: aces })).toBe(true);
    expect(sameDiceRules({ ...base, explode: { ...aces, repeats: false } }, { ...base, explode: aces })).toBe(false);
  });

  it('keeps the exploding rule of a stored preset and drops a broken one', () => {
    const preset = (dice: unknown): unknown => ({ id: 'user-1', name: 'Mine', rules: { ...structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules), dice } });
    const [kept] = parseUserPresets([preset({ defaultRoll: '1d8', crit: 'none', explode: aces })]);
    expect(kept?.rules.dice).toEqual({ defaultRoll: '1d8', crit: 'none', explode: aces });
    const [dropped] = parseUserPresets([preset({ defaultRoll: '1d8', crit: 'none', explode: { dice: 'all' } })]);
    expect(dropped?.rules.dice).toEqual({ defaultRoll: '1d8', crit: 'none' });
  });

  it('switches exploding on with the default rule, keeps a rule\'s settings and removes it when off', () => {
    const base = { defaultRoll: '1d10', crit: 'natural' as const };
    expect(withExplodeScope(base, 'all')).toEqual({ ...base, explode: aces });
    const once = { ...base, explode: { dice: 'all', repeats: false, highFaces: 2, lowFaces: 1 } as const };
    expect(withExplodeScope(once, 'default').explode).toEqual({ ...once.explode, dice: 'default' });
    expect(withExplodeScope(once, 'off')).toEqual(base);
    expect('explode' in withExplodeScope(once, 'off')).toBe(false);
  });

  it('sets Cyberpunk RED to explode its check die once, up on a 10 and down on a 1', () => {
    const red = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cyberpunk RED')!;
    expect(red.rules.dice?.explode).toEqual({ dice: 'default', repeats: false, highFaces: 1, lowFaces: 1 });
  });
});

describe('exploding dice in words', () => {
  it('names the faces of a die that explode', () => {
    expect(highFaceNames(10, 1)).toBe('10');
    expect(highFaceNames(10, 2)).toBe('9 or 10');
    expect(highFaceNames(100, 5)).toBe('96 to 100');
    expect(lowFaceNames(10, 1, 1)).toBe('1');
    expect(lowFaceNames(100, 5, 5)).toBe('1 to 5');
    // As the roll counts them: one face of every die never explodes.
    expect(highFaceNames(4, 9)).toBe('2 to 4');
    expect(lowFaceNames(4, 9, 9)).toBe('');
    expect(lowFaceNames(4, 9, 1)).toBe('1 or 2');
  });

  it('says what a rule does with the collection\'s own die', () => {
    expect(describeExplodeRule({ dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 }, 20)).toBe(
      'Every die that shows its highest face is rolled again and the new die is added: a d20 on 20, a d6 on 6. The new die can explode too.',
    );
    expect(describeExplodeRule({ dice: 'default', repeats: false, highFaces: 1, lowFaces: 1 }, 10)).toBe(
      'A default die (d10) that shows 10 is rolled again and the new die is added. One that shows 1 is rolled again and the new die is subtracted. The new die does not explode.',
    );
    expect(describeExplodeRule({ dice: 'all', repeats: false, highFaces: 2, lowFaces: 1 }, 6)).toBe(
      'Every die that shows one of its 2 highest faces is rolled again and the new die is added: a d6 on 5 or 6, a d20 on 19 or 20. One that shows its lowest face is rolled again and the new die is subtracted. The new die does not explode.',
    );
  });
});

describe('default dice explained', () => {
  it('says what they are with the collection\'s own roll, and with 1d20 while that is not valid', () => {
    expect(defaultDiceExplanation(' 2d12 ')).toBe(
      'The default dice are the set\'s dice, 2d12. Atlas rolls them when a statblock gives only a bonus without dice: +3 rolls 2d12+3, −3 rolls 2d12−3.',
    );
    expect(defaultDiceExplanation('2d')).toContain('+3 rolls 1d20+3');
  });
});

