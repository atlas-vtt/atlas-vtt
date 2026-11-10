import { describe, expect, it } from 'vitest';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { parseAdvantageRule, parseStoredDiceSet } from '../../../src/app/gameSystems/diceSetValidation';
import { DiceSetService } from '../../../src/app/services/diceSets/DiceSetService';
import { memoryPresets } from '../../mocks/memoryPresets';

const D20 = { id: 'set-d20', name: 'Checks', crit: 'natural', dice: [{ count: 1, sides: 20 }] };
const builtIn = (id: string) => BUILT_IN_DICE_SETS.find((set) => set.id === id)!;

describe('advantage rules as a set stores them', () => {
  it('reads the three kinds, leaving out what it does not know', () => {
    expect(parseAdvantageRule({ kind: 'keep' })).toEqual({ kind: 'keep' });
    expect(parseAdvantageRule({ kind: 'keep', tensOnly: true, stacking: 2 })).toEqual({ kind: 'keep', tensOnly: true });
    expect(parseAdvantageRule({ kind: 'die', sides: 6, name: ' Edge ', colour: '#CA8A04' })).toEqual({ kind: 'die', sides: 6, name: 'Edge', colour: '#ca8a04' });
    expect(parseAdvantageRule({ kind: 'number', value: 2 })).toEqual({ kind: 'number', value: 2 });
  });

  it('refuses a rule it cannot roll', () => {
    for (const raw of [null, 'keep', { kind: 'reroll' }, { kind: 'die', sides: 1 }, { kind: 'die' }, { kind: 'number', value: 0 }, { kind: 'number', value: 1.5 }, { kind: 'number', value: 100 }]) {
      expect(parseAdvantageRule(raw)).toBeNull();
    }
  });

  it('reads a set with its rules, and keeps a set whose rule a newer Atlas wrote from being written over', () => {
    expect(parseStoredDiceSet({ ...D20, advantage: { kind: 'keep' }, disadvantage: { kind: 'number', value: 3 } }))
      .toMatchObject({ advantage: { kind: 'keep' }, disadvantage: { kind: 'number', value: 3 } });
    const newer = parseStoredDiceSet({ ...D20, advantage: { kind: 'boon', dice: 3 } })!;
    expect(newer.advantage).toBeUndefined();
    expect(newer.readOnly).toBe(true);
  });

  it('gives the built-in sets sensible rules', () => {
    expect(builtIn('builtin:d20')).toMatchObject({ advantage: { kind: 'keep' }, disadvantage: { kind: 'keep' } });
    expect(builtIn('builtin:d20-roll-under')).toMatchObject({ advantage: { kind: 'keep' }, disadvantage: { kind: 'keep' } });
    expect(builtIn('builtin:d100-roll-under').advantage).toEqual({ kind: 'keep' });
    expect(builtIn('builtin:d10-exploding').advantage).toBeUndefined();
    expect(builtIn('builtin:d10-exploding').disadvantage).toBeUndefined();
    expect(builtIn('builtin:power-roll')).toMatchObject({ advantage: { kind: 'number', value: 2 }, disadvantage: { kind: 'number', value: 2 } });
  });
});

describe('advantage rules through the library', () => {
  it('round-trips both sides, and a copy of a built-in set takes its rules', () => {
    const storage = memoryPresets();
    const service = new DiceSetService(storage);
    const made = service.create('Duality', {
      dice: [{ count: 1, sides: 12 }, { count: 1, sides: 12 }], crit: 'doubles',
      advantage: { kind: 'die', sides: 6, name: 'Advantage' }, disadvantage: { kind: 'die', sides: 6 },
    });
    expect(service.list().find((set) => set.id === made.id)).toMatchObject({
      advantage: { kind: 'die', sides: 6, name: 'Advantage' }, disadvantage: { kind: 'die', sides: 6 },
    });
    const copy = service.duplicate('builtin:power-roll', (name) => `${name} copy`)!;
    expect(storage.current().find((entry) => entry.id === copy.id)).toMatchObject({ advantage: { kind: 'number', value: 2 } });
  });

  it('changes a side field by field, keeping what a newer Atlas added to the rule and the set', () => {
    const storage = memoryPresets([{ ...D20, future: 1, advantage: { kind: 'keep', stacking: 'max-2' } }]);
    const service = new DiceSetService(storage);
    service.update('set-d20', { advantage: { kind: 'keep', tensOnly: true } });
    expect(storage.current()[0]).toMatchObject({ future: 1, advantage: { kind: 'keep', tensOnly: true, stacking: 'max-2' } });
    service.update('set-d20', { disadvantage: { kind: 'number', value: 4 } });
    expect(storage.current()[0]).toMatchObject({ disadvantage: { kind: 'number', value: 4 } });
    service.update('set-d20', { advantage: undefined });
    expect(storage.current()[0]).not.toHaveProperty('advantage');
    expect(storage.current()[0]).toHaveProperty('disadvantage');
  });
});
