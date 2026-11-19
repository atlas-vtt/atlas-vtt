import { describe, expect, it } from 'vitest';
import { readDiceShelf } from '../../src/app/react/components/dice/diceShelf';
import { designedPreset, withSlot } from '../../src/app/react/components/dice/diceTraySlots';
import { bonusText, lookOfFormula, lookOfSet, presetSet, presetText } from '../../src/app/react/components/dice/presetLook';
import { presetOfDraft } from '../../src/app/react/components/dice/usePresetDraft';
import type { DicePreset } from '../../src/app/types/dicePresetTypes';
import type { RollingDice } from '../../src/app/types/diceSetTypes';

const look: RollingDice = { dice: [{ count: 1, sides: 8, name: 'Slashing', colour: '#b91c1c' }], crit: 'natural' };
const sword: DicePreset = { id: 'a', name: 'Longsword', formula: '+3', look };

describe('a saved roll with designed dice', () => {
  it('reads a formula of plain dice as dice to dress, its labels as names and its numbers as the bonus', () => {
    expect(lookOfFormula('1d8[slashing] + 1d6[fire] + 3 - 1')).toEqual({
      look: { dice: [{ count: 1, sides: 8, name: 'slashing' }, { count: 1, sides: 6, name: 'fire' }], crit: 'natural' },
      bonus: '+2',
    });
    expect(lookOfFormula('2d12')).toEqual({ look: { dice: [{ count: 2, sides: 12 }], crit: 'natural' }, bonus: '' });
    for (const formula of ['4d6kh3', '2d6!', '1d20r1', '8d10cs>=8', '(1d8+2)*2', '4dF', '1d20-1d4', '+3']) expect(lookOfFormula(formula)).toBeNull();
  });

  it('keeps a look only where the Dice Lab would read it as a set; without one, a bare bonus is no roll', () => {
    const shelf = readDiceShelf({
      dicePresets: [
        sword,
        { id: 'b', name: 'Broken', formula: '+2', look: { dice: [], crit: 'natural' } },
        { id: 'c', name: 'Odd', formula: '1d6', look: { dice: [{ count: 1, sides: 6, colour: 'red' }], crit: 'natural' } },
        { id: 'd', name: 'Words', formula: 'x', look },
      ],
    });
    expect(shelf.presets.map((preset) => [preset.id, preset.look !== undefined])).toEqual([['a', true], ['c', false], ['d', false]]);
  });

  it('rolls as a set of its own, written as its dice and bonus', () => {
    expect(presetSet(sword)).toMatchObject({ id: 'saved-roll:a', name: 'Longsword', builtIn: false, dice: look.dice, crit: 'natural' });
    expect(presetText(sword)).toBe('d8 + 3');
    expect(presetText({ ...sword, formula: '-2' })).toBe('d8 − 2');
    expect(presetSet({ id: 'f', name: 'F', formula: '1d6' })).toBeNull();
    expect(bonusText(0)).toBe('');
    expect(bonusText(250)).toBe('+99');
  });

  it('never joins what the tray holds: its place rolls it on its own', () => {
    const slot = { kind: 'preset' as const, id: 'a' };
    expect(designedPreset(slot, [sword])).toBe(sword);
    expect(withSlot('1d20 + 2', slot, [sword], 1)).toBe('1d20 + 2');
  });

  it('copies a set\'s dice and rules without what names it in the library', () => {
    expect(lookOfSet({ ...look, id: 'x', name: 'X', builtIn: true, explode: { dice: 'all' } } as never)).toEqual({ ...look, explode: { dice: 'all' } });
  });

  it('is written from its editor only once it can be: a name, dice, and rules that read', () => {
    const draft = { name: 'Longsword', dice: [{ id: 'd1', sides: 8, name: 'Slashing', colour: '#b91c1c' }], crit: 'natural' as const, bonus: 4, formula: '' };
    expect(presetOfDraft(sword, draft)).toEqual({ ...sword, formula: '+4' });
    expect(presetOfDraft(sword, { ...draft, name: ' ' })).toBeNull();
    expect(presetOfDraft(sword, { ...draft, dice: [] })).toBeNull();
    expect(presetOfDraft({ id: 'f', name: 'F', formula: '4d6kh3' }, { ...draft, formula: '4d6kh2' })).toEqual({ id: 'f', name: 'Longsword', formula: '4d6kh2' });
  });
});
