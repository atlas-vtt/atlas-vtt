import { describe, expect, it, vi } from 'vitest';

const templateSet = vi.hoisted(() => ({ set: undefined as unknown }));
vi.mock('../../../src/app/statblocks/resolve/templateDiceSet', () => ({ templateDiceSet: () => templateSet.set }));

import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import { rollStatblockDice } from '../../../src/app/services/statblockRolls';
import { DiceTool, rollDiceFormula, rollingWith, type DiceRollInputs } from '../../../src/app/tools/DiceTool';
import { dieLabel, namedDiceLine, rollLine } from '../../../src/app/tools/diceLabels';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';
import { EventEmitter } from 'events';

/** A line as read: the spaces it never breaks at are spaces. */
const read = (line: string | null): string | null => line?.replace(/\u00a0/g, ' ') ?? null;

const duality: DiceSet = {
  id: 'set-duality', name: 'Duality', builtIn: false, crit: 'doubles',
  dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }],
};
const powerRoll = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:power-roll')!;
const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;

/** Inputs whose dice show `faces` in turn: each value is the face a d`sides` shows. */
function inputs(...faces: Array<[number, number]>): DiceRollInputs {
  const queue = [...faces];
  return {
    random: () => {
      const [face, sides] = queue.shift() ?? [1, 2];
      return (face - 0.5) / sides;
    },
    rollId: () => 'roll',
    roller: () => 'GM',
    onFormulaError: vi.fn(),
  };
}

describe('a roll with a dice set', () => {
  it('gives a bare bonus the set\'s dice with their names and colours', () => {
    const result = rollDiceFormula('+3', duality, inputs([9, 12], [4, 12]))!;
    expect(result.formula).toBe('1d12+1d12+3');
    expect(result.rolls).toEqual([
      { die: 'd12', value: 9, max: 12, name: 'Hope', colour: '#ca8a04' },
      { die: 'd12', value: 4, max: 12, name: 'Fear', colour: '#7e22ce' },
    ]);
    expect(result.total).toBe(16);
    expect(read(rollLine(result))).toBe('Hope 9 · Fear 4 + 3');
    expect(dieLabel(result.rolls, 0)).toBe('Hope: 9');
  });

  it('rolls dice written out as written, without names', () => {
    const result = rollDiceFormula('1d8 + 3', duality, inputs([5, 8]))!;
    expect(result.rolls).toEqual([{ die: 'd8', value: 5, max: 8 }]);
    expect(namedDiceLine(result.rolls, result.modifiers)).toBeNull();
    expect(rollLine(result)).toBe('1d8 + 3');
  });

  it('can give explicit matching dice the set appearance without changing the written roll', () => {
    const bus = new EventEmitter();
    const hear = vi.fn();
    bus.on('dice-rolled', hear);
    const tool = new DiceTool(bus, () => duality, inputs([9, 12], [4, 12], [3, 6]));
    const result = tool.rollDice('2d12+d6+2', undefined, undefined, { setAppearance: true })!;
    expect(result.formula).toBe('2d12+d6+2');
    expect(result.total).toBe(18);
    expect(result.rolls).toEqual([
      { die: 'd12', max: 12, value: 9, name: 'Hope', colour: '#ca8a04' },
      { die: 'd12', max: 12, value: 4, name: 'Fear', colour: '#7e22ce' },
      { die: 'd6', max: 6, value: 3 },
    ]);
    expect(hear.mock.calls[0]?.[0]).toBe(result);
  });

  it('requires the whole matching pool and an explicit appearance request', () => {
    const tool = new DiceTool(new EventEmitter(), () => duality, inputs());
    for (const formula of ['d12', 'd8+d12', 'd12-d12', '2d8']) {
      expect(tool.rollDice(formula, undefined, undefined, { setAppearance: true })!.rolls.some((die) => die.name || die.colour)).toBe(false);
    }
    expect(tool.rollDice('d12+d12')!.rolls.some((die) => die.name || die.colour)).toBe(false);
  });

  it('gives explosions their original die’s appearance and leaves extra dice alone', () => {
    const tool = new DiceTool(new EventEmitter(), () => ({ ...duality, explode: { dice: 'default', repeats: false, highFaces: 1, lowFaces: 0 } }), inputs([12, 12], [5, 12], [3, 12], [2, 12]));
    const result = tool.rollDice('d12+d12+d12', undefined, undefined, { setAppearance: true })!;
    expect(result.rolls.map(({ name }) => name)).toEqual(['Hope', 'Hope', 'Fear', undefined]);
    expect(result.rolls.map(({ value }) => value)).toEqual([12, 5, 3, 2]);
  });

  it('is critical by the set\'s rule over the set\'s dice', () => {
    expect(rollDiceFormula('+3', duality, inputs([7, 12], [7, 12]))!.crit).toBe('high');
    expect(rollDiceFormula('+3', duality, inputs([7, 12], [8, 12]))!.crit).toBeNull();
    expect(rollDiceFormula('+2', powerRoll, inputs([10, 10], [9, 10]))!.crit).toBe('high');
    expect(rollDiceFormula('+2', powerRoll, inputs([10, 10], [8, 10]))!.crit).toBeNull();
    const mixed: DiceSet = { ...duality, crit: 'natural', dice: [{ count: 1, sides: 20 }, { count: 1, sides: 6, name: 'Boon' }] };
    expect(rollDiceFormula('', mixed, inputs([3, 20], [6, 6]))!.crit).toBe('high');
    expect(rollDiceFormula('', mixed, inputs([3, 20], [1, 6]))!.crit).toBe('low');
  });

  it('explodes by the set\'s rule, the dice of an explosion taking their die\'s name and colour', () => {
    const exploding: DiceSet = { ...duality, explode: { dice: 'default', repeats: false, highFaces: 1, lowFaces: 0 } };
    const result = rollDiceFormula('', exploding, inputs([12, 12], [5, 12], [3, 12]))!;
    expect(result.rolls).toEqual([
      { die: 'd12', value: 12, max: 12, name: 'Hope', colour: '#ca8a04' },
      { die: 'd12', value: 5, max: 12, name: 'Hope', colour: '#ca8a04', exploded: true },
      { die: 'd12', value: 3, max: 12, name: 'Fear', colour: '#7e22ce' },
    ]);
    expect(read(rollLine(result))).toBe('Hope 12! + 5 · Fear 3');
    expect(rollLine(result)).toBe('Hope\u00a012!\u00a0+\u00a05 · Fear\u00a03');
  });

  it('names the set only where it is not the collection\'s own', () => {
    expect(rollingWith(d20, undefined)).toEqual({ rules: d20 });
    expect(rollingWith(d20, d20)).toEqual({ rules: d20 });
    expect(rollingWith(d20, powerRoll)).toEqual({ rules: powerRoll, shown: { id: powerRoll.id, name: 'Power roll' } });
    const result = rollDiceFormula('+2', powerRoll, inputs([3, 10], [4, 10]), { id: powerRoll.id, name: powerRoll.name })!;
    expect(rollLine(result)).toBe('Power roll · 2d10+2');
  });

  it('throws each die in its colour, a percentile die\'s both halves alike', () => {
    expect(sceneFromRolls([{ max: 12, value: 9, colour: '#ca8a04' }, { max: 12, value: 4 }])?.plan).toEqual([
      { sides: 12, role: 'plain', colour: '#ca8a04' },
      { sides: 12, role: 'plain' },
    ]);
    expect(sceneFromRolls([{ max: 100, value: 42, colour: '#1d4ed8' }])?.plan.map((die) => die.colour)).toEqual(['#1d4ed8', '#1d4ed8']);
  });
});

describe('a statblock\'s roll', () => {
  function mapWith(set: DiceSet) {
    const tool = new DiceTool(new EventEmitter(), () => set, inputs([10, 10], [10, 10]));
    const view = { containerEl: { isShown: () => true }, serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) } };
    return { workspace: { getLeavesOfType: () => [{ view }] }, vault: { getFileByPath: () => null } } as never;
  }

  it('rolls a bare bonus with its template\'s set, named on the roll', () => {
    templateSet.set = powerRoll;
    const result = rollStatblockDice(mapWith(d20), '+4', { statblockPath: 'Goblin.md' })!;
    expect(result).toMatchObject({ formula: '2d10+4', crit: 'high', diceSet: { id: powerRoll.id, name: 'Power roll' } });
  });

  it('rolls with the collection\'s set where the template names none (and every Fantasy Statblocks note)', () => {
    templateSet.set = undefined;
    const result = rollStatblockDice(mapWith(powerRoll), '+4', { statblockPath: 'Goblin.md' })!;
    expect(result.formula).toBe('2d10+4');
    expect(result.diceSet).toBeUndefined();
  });
});
