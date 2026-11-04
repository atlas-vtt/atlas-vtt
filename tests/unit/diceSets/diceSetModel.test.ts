import { describe, expect, it } from 'vitest';
import { BUILT_IN_DICE_SETS, D20_DICE_SET_ID, POWER_ROLL_DICE_SET_ID } from '../../../src/app/gameSystems/builtInDiceSets';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { DICE_SET_FORMAT, parseStoredDiceSet } from '../../../src/app/gameSystems/diceSetValidation';
import { diceRulesOfSet, parseRollGroups, rollingRules, sameRolling, setRoll, setRollText } from '../../../src/app/gameSystems/diceSets';
import { findDiceSet } from '../../../src/app/gameSystems/diceSetResolution';

const duality = {
  id: 'set-duality',
  name: 'Duality dice',
  dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#CA8A04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }],
  crit: 'doubles',
};

describe('built-in dice sets', () => {
  it('keep their ids, which collections, presets and templates name', () => {
    expect(BUILT_IN_DICE_SETS.map((set) => set.id)).toEqual([
      'builtin:d20', 'builtin:d20-roll-under', 'builtin:d100-roll-under', 'builtin:d10-exploding', 'builtin:power-roll',
    ]);
    expect(BUILT_IN_DICE_SETS.every((set) => set.builtIn)).toBe(true);
  });

  it('roll as the dice rules of the built-in systems that name them', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const set = findDiceSet([], preset.rules.diceSetId);
      expect(set, preset.name).toBeDefined();
      expect(sameRolling(set!, rollingRules(preset.rules.dice!)), preset.name).toBe(true);
    }
    expect(BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Draw Steel')?.rules.diceSetId).toBe(POWER_ROLL_DICE_SET_ID);
    expect(BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')?.rules.diceSetId).toBe(D20_DICE_SET_ID);
  });
});

describe('reading a dice set file', () => {
  it('reads a set with names and colours, colours in lower case', () => {
    expect(parseStoredDiceSet({ format: 1, ...duality })).toEqual({
      ...duality,
      builtIn: false,
      dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }],
    });
  });

  it('reads a set a newer Atlas wrote, read-only, and ignores fields it does not know', () => {
    const set = parseStoredDiceSet({ ...duality, format: DICE_SET_FORMAT + 1, mood: 'grim', dice: [{ count: 2, sides: 6, glow: true }] });
    expect(set).toMatchObject({ readOnly: true, dice: [{ count: 2, sides: 6 }] });
    expect(set).not.toHaveProperty('mood');
  });

  it('leaves out a name or colour it cannot use, and refuses dice that cannot roll', () => {
    expect(parseStoredDiceSet({ ...duality, dice: [{ count: 1, sides: 20, name: '   ', colour: 'red' }] })?.dice).toEqual([{ count: 1, sides: 20 }]);
    for (const dice of [[], [{ count: 0, sides: 6 }], [{ count: 1, sides: 1 }], [{ count: 21, sides: 6 }], [{ count: 11, sides: 6 }, { count: 10, sides: 6 }], 'd20', Array(7).fill({ count: 1, sides: 6 })]) {
      expect(parseStoredDiceSet({ ...duality, dice }), JSON.stringify(dice)).toBeNull();
    }
  });

  it('refuses a file without id or name, with a built-in id, an unknown critical rule or an exploding rule it cannot read', () => {
    expect(parseStoredDiceSet({ ...duality, id: '' })).toBeNull();
    expect(parseStoredDiceSet({ ...duality, name: '' })).toBeNull();
    expect(parseStoredDiceSet({ ...duality, id: 'builtin:d20' })).toBeNull();
    expect(parseStoredDiceSet({ ...duality, crit: 'sometimes' })).toBeNull();
    expect(parseStoredDiceSet({ ...duality, explode: { dice: 'some' } })).toBeNull();
    expect(parseStoredDiceSet({ ...duality, explode: { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 } })?.explode).toEqual({ dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 });
  });
});

describe('dice rules of a set', () => {
  it('reads default rolls of one group or several', () => {
    expect(parseRollGroups(' 2d12 ')).toEqual([{ count: 2, sides: 12 }]);
    expect(parseRollGroups('d20+1d6')).toEqual([{ count: 1, sides: 20 }, { count: 1, sides: 6 }]);
    expect(parseRollGroups('1d20+3')).toBeNull();
    expect(parseRollGroups('')).toBeNull();
  });

  it('writes what older versions read: one group where the dice are alike, else the groups joined', () => {
    expect(diceRulesOfSet(parseStoredDiceSet(duality)!)).toEqual({ defaultRoll: '2d12', crit: 'doubles' });
    const mixed = { dice: [{ count: 1, sides: 20 }, { count: 1, sides: 6 }], crit: 'natural' as const };
    expect(diceRulesOfSet(mixed)).toEqual({ defaultRoll: '1d20+1d6', crit: 'natural' });
    expect(rollingRules(diceRulesOfSet(mixed)).dice).toEqual(mixed.dice);
    expect(setRoll(mixed.dice)).toBe('1d20+1d6');
    expect(setRollText(mixed.dice)).toBe('d20 + d6');
  });
});
