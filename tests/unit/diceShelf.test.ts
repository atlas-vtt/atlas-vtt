import { describe, expect, it } from 'vitest';
import {
  MAX_PRESETS, MAX_ROW, STANDARD_ROW, newPreset, readDiceShelf, typedRowDie, withPinToggled, withRowDie, withRowSlotMoved, withSavedPreset, withoutPreset,
  type DiceShelf,
} from '../../src/app/react/components/dice/diceShelf';
import { presetCount, presetTerm, withDie, withPreset, withoutPresetTerms } from '../../src/app/react/components/dice/diceTrayText';
import { diceCounts } from '../../src/app/react/components/dice/diceTrayPool';
import { presetFaceParts } from '../../src/app/react/components/dice/presetFace';
import type { DicePreset } from '../../src/app/types/dicePresetTypes';

const sword: DicePreset = { id: 'a', name: 'Longsword', formula: '1d8+3[slashing]' };
const duality: DicePreset = { id: 'b', name: 'Duality', formula: '2d12' };

describe('dice shelf', () => {
  it('reads the standard seven dice while the collection has no row of its own', () => {
    expect(readDiceShelf(undefined)).toEqual({ presets: [], row: STANDARD_ROW, ownRow: false });
  });

  it('keeps only usable presets and places, without repeats or a place for a deleted roll', () => {
    const shelf = readDiceShelf({
      dicePresets: [sword, sword, { id: 'c', name: '', formula: '1d6' }, { id: 'd', name: 'x', formula: 7 } as never, duality],
      diceRow: [{ kind: 'die', sides: 20 }, { kind: 'die', sides: 20 }, { kind: 'die', sides: 1 }, { kind: 'preset', id: 'gone' },
        { kind: 'preset', id: 'b' }, 'd6' as never],
    });
    expect(shelf.presets.map((preset) => preset.id)).toEqual(['a', 'b']);
    expect(shelf.row).toEqual([{ kind: 'die', sides: 20 }, { kind: 'preset', id: 'b' }]);
    expect(shelf.ownRow).toBe(true);
  });

  it('pins a saved roll at the end of the row and takes it out again; a full row takes no more', () => {
    const shelf: DiceShelf = { presets: [duality], row: STANDARD_ROW, ownRow: false };
    const pinned = withPinToggled(shelf, 'b')!.diceRow!;
    expect(pinned.at(-1)).toEqual({ kind: 'preset', id: 'b' });
    expect(withPinToggled({ ...shelf, row: pinned }, 'b')!.diceRow).toEqual(STANDARD_ROW);
    const full = Array.from({ length: MAX_ROW }, (_, at) => ({ kind: 'die' as const, sides: at + 2 }));
    expect(withPinToggled({ ...shelf, row: full }, 'b')).toBeNull();
    expect(withRowDie({ ...shelf, row: full }, 30)).toBeNull();
  });

  it('swaps the d100 for a pair of d12 by moving and removing places', () => {
    const shelf: DiceShelf = { presets: [duality], row: [...STANDARD_ROW, { kind: 'preset', id: 'b' }], ownRow: true };
    const moved = withRowSlotMoved(shelf, 7, 6)!.diceRow!;
    expect(moved.slice(5)).toEqual([{ kind: 'die', sides: 20 }, { kind: 'preset', id: 'b' }, { kind: 'die', sides: 100 }]);
  });

  it('deletes a saved roll with its place, and saves no more than the limit', () => {
    const shelf: DiceShelf = { presets: [sword, duality], row: [{ kind: 'preset', id: 'b' }], ownRow: true };
    expect(withoutPreset(shelf, 'b')).toEqual({ dicePresets: [sword], diceRow: [] });
    expect(withoutPreset(shelf, 'a')).toEqual({ dicePresets: [duality] });
    expect(withSavedPreset(shelf, newPreset(' Fire bolt ', ' 1d10[fire] ', undefined, 'c'))!.dicePresets!.at(-1)).toEqual({ id: 'c', name: 'Fire bolt', formula: '1d10[fire]' });
    const many = Array.from({ length: MAX_PRESETS }, (_, at) => ({ ...sword, id: String(at) }));
    expect(withSavedPreset({ ...shelf, presets: many }, newPreset('x', '1d6'))).toBeNull();
  });

  it('reads a typed die and says why one cannot join the row', () => {
    const shelf: DiceShelf = { presets: [], row: STANDARD_ROW, ownRow: false };
    expect(typedRowDie(shelf, 'd3')).toEqual({ sides: 3, problem: null });
    expect(typedRowDie(shelf, '7').sides).toBe(7);
    expect(typedRowDie(shelf, 'd%')).toEqual({ sides: 100, problem: 'present' });
    expect(typedRowDie(shelf, 'd20')).toEqual({ sides: 20, problem: 'present' });
    expect(typedRowDie(shelf, 'd1')).toEqual({ sides: 1, problem: 'faces' });
    expect(typedRowDie(shelf, '2d6')).toEqual({ sides: null, problem: 'not-a-die' });
    const full = Array.from({ length: MAX_ROW }, (_, at) => ({ kind: 'die' as const, sides: at + 2 }));
    expect(typedRowDie({ ...shelf, row: full }, 'd30').problem).toBe('full');
  });
});

describe('the tray with saved rolls and dice of any size', () => {
  it('adds a saved roll as a bracketed term of its own before the modifier, and takes its last copy back', () => {
    expect(presetTerm(sword.formula)).toBe('(1d8+3[slashing])');
    expect(withPreset('', duality.formula, 1)).toBe('(2d12)');
    expect(withPreset('1d20 + 3', sword.formula, 1)).toBe('1d20 + (1d8+3[slashing]) + 3');
    expect(withPreset('(2d12) + (2d12) + 3', duality.formula, -1)).toBe('(2d12) + 3');
    expect(withPreset('(2d12) + 3', duality.formula, -1)).toBe('3');
    expect(presetCount('(2d12) + 1d6 + (2d12) − 1', duality.formula)).toBe(2);
    expect(presetCount('2d12', duality.formula)).toBe(0);
  });

  it('keeps the dice of a saved roll apart from the row\'s dice: never counted, never grown', () => {
    const presets = ['3d8+3', duality.formula];
    const text = withPreset(withPreset('', '3d8+3', 1), duality.formula, 1);
    expect(text).toBe('(3d8+3) + (2d12)');
    expect(diceCounts(withoutPresetTerms(text, presets))).toEqual({});
    const more = withDie(withDie(text, 8, 1, presets), 12, 1, presets);
    expect(more).toBe('(3d8+3) + (2d12) + 1d8 + 1d12');
    expect(diceCounts(withoutPresetTerms(more, presets))).toEqual({ 8: 1, 12: 1 });
    expect(withDie(withDie(more, 8, -1, presets), 12, -1, presets)).toBe(text);
    expect(presetCount(more, '3d8+3')).toBe(1);
  });

  it('counts and writes dice the standard row does not have', () => {
    expect(withDie(withDie('1d20', 3, 1), 3, 1)).toBe('2d3 + 1d20');
    expect(diceCounts('2d3 + 1d7')).toEqual({ 3: 2, 7: 1 });
  });
});

describe('a saved roll\'s face', () => {
  it('shows the first die, how many, what is done to them and what is added', () => {
    expect(presetFaceParts('3d8kh1+3')).toEqual({ sides: 8, count: 3, rule: 'kh1', rest: '+3' });
    expect(presetFaceParts('(1d8+3[slashing])')).toEqual({ sides: 8, count: 1, rule: '', rest: '+3' });
    expect(presetFaceParts('2d12')).toEqual({ sides: 12, count: 2, rule: '', rest: '' });
    expect(presetFaceParts('4d6kh3')).toEqual({ sides: 6, count: 4, rule: 'kh3', rest: '' });
    expect(presetFaceParts('2d6! + 1d4 − 1')).toEqual({ sides: 6, count: 2, rule: '!', rest: '+1d4-1' });
    expect(presetFaceParts('3 + 1d6')).toEqual({ sides: 6, count: 1, rule: '', rest: '+3' });
    expect(presetFaceParts('(1d8+2)*2')).toEqual({ sides: 8, count: 1, rule: '', rest: '(+2)*2' });
    expect(presetFaceParts('d%')).toMatchObject({ sides: 100, count: 1 });
    expect(presetFaceParts('4dF')).toMatchObject({ sides: null, count: 4 });
    expect(presetFaceParts('+3')).toBeNull();
  });
});
