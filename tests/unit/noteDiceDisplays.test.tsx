// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiceRollSubscription } from '../../src/app/react/components/dice/DiceRollDisplay';
import type { App } from 'obsidian';

const state = vi.hoisted(() => ({
  map: null as unknown,
  shown: vi.fn(),
  roll: vi.fn(),
  diceSet: {
    dice: [{ count: 1, sides: 20 }],
    crit: 'natural',
    advantage: { kind: 'keep' },
    disadvantage: { kind: 'keep' },
  },
}));
vi.mock('../../src/app/services/statblockRolls', () => ({ mapDice: () => state.map }));
vi.mock('../../src/app/services/diceSets/collectionDiceSets', () => ({ diceSetOfCollection: () => state.diceSet }));
vi.mock('../../src/app/services/offlineDiceInputs', () => ({ offlineDiceInputs: () => ({}) }));
vi.mock('../../src/app/tools/DiceTool', () => ({ rollDiceFormula: state.roll }));
vi.mock('../../src/app/react/components/dice/DiceRollDisplay', () => ({
  DiceRollDisplay: ({ subscribe }: { subscribe: DiceRollSubscription }) => {
    useEffect(() => subscribe(state.shown), [subscribe]);
    return null;
  },
}));

import { NoteDiceDisplays } from '../../src/app/noteDice/NoteDiceDisplays';
import { defaultDiceSet } from '../../src/app/gameSystems/diceSetResolution';

afterEach(() => {
  state.map = null;
  state.shown.mockReset();
  state.roll.mockReset();
});

describe('note dice display routing', () => {
  it('offers only the sides supported by the map dice for the formula', () => {
    const displays = new NoteDiceDisplays({} as App);
    const rules = defaultDiceSet();
    state.map = { tool: { rollingDice: () => rules }, onScreen: true, document };
    expect(displays.advantageSides('+3')).toEqual(['advantage', 'disadvantage']);
    expect(displays.advantageSides('2d6')).toEqual([]);
    state.map = { tool: {}, onScreen: true, document };
    expect(displays.advantageSides('+3')).toEqual([]);
    state.map = null;
    expect(displays.advantageSides('+3')).toEqual(['advantage', 'disadvantage']);
    expect(displays.advantageSides('2d6')).toEqual([]);
    displays.destroy();
  });
  it('uses the visible map without showing a second roll', () => {
    const rollDice = vi.fn(() => ({ id: 'one' }));
    state.map = { tool: { rollDice }, onScreen: true, document };
    const displays = new NoteDiceDisplays({} as App);
    displays.roll(document, '+3', 'advantage');
    expect(rollDice).toHaveBeenCalledWith('+3', { type: 'toolbar' }, undefined, { advantage: 'advantage' });
    expect(document.querySelector('.atlas-note-dice-rolls')).toBeNull();
    displays.destroy();
  });

  it('shows a hidden map roll muted and an off-map roll with sound', async () => {
    const result = { id: 'one' };
    state.map = { tool: { rollDice: () => result }, onScreen: false, document };
    const displays = new NoteDiceDisplays({} as App);
    await act(async () => { displays.roll(document, '1d6', null); });
    expect(state.shown).toHaveBeenCalledWith(result, { muted: true });

    state.map = null;
    state.roll.mockReturnValue(result);
    await act(async () => { displays.roll(document, '+3', null); });
    expect(state.roll).toHaveBeenCalledWith('+3', state.diceSet, {}, undefined, undefined);
    expect(state.shown).toHaveBeenLastCalledWith(result, { muted: false });
    await act(async () => { displays.destroy(); });
    expect(document.querySelector('.atlas-note-dice-rolls')).toBeNull();
  });
});
