import { EventEmitter } from 'events';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { buildExtension } from '../../src/api/extension';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { diceColourSlot } from '../../src/app/extensions/slots';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { addPick, removePick, taggedGroups, trayTags } from '../../src/app/react/components/dice/trayPicks';
import { offlineDiceInputs } from '../../src/app/services/offlineDiceInputs';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { diceColoursFor, MAX_DICE_COLOURS } from '../../src/app/tools/diceColourChoices';
import { withDieTags, type DieTag } from '../../src/app/tools/diceTags';
import type { RolledDie } from '../../src/app/tools/diceFormula';
import type { AtlasCapability } from '../../src/api/types/common';
import { fakeApp, fakePlugin, fakeServices } from '../api/apiFakes';

const FIRE: DieTag = { color: '#dd3333', colorName: 'Fire' };
const ICE: DieTag = { color: '#3366dd', colorName: 'Ice' };

function host(capabilities: readonly AtlasCapability[] = LANDED_CAPABILITIES): AtlasApiHost {
  const { app } = fakeApp();
  return new AtlasApiHost({ app, capabilities, build: (scope) => buildExtension(scope, fakeServices(app)) });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  expect(diceColourSlot.list()).toHaveLength(0);
});

describe('dice.registerColours', () => {
  it('is there only with dice-colours, needs a function, and goes when the extension unloads', () => {
    expect(host(['dice']).api.connect(fakePlugin('ext')).dice.registerColours).toBeUndefined();
    const plugin = fakePlugin('ext');
    const dice = host().api.connect(plugin).dice;
    expect(() => dice.registerColours!(1 as never)).toThrow('[Atlas API] dice.registerColours needs a function.');
    dice.registerColours!(() => [{ name: 'Fire', color: '#dd3333' }]);
    expect(diceColoursFor('c')).toEqual([FIRE]);
    plugin.unload();
    expect(diceColoursFor('c')).toEqual([]);
  });

  it('asks every provider with the collection, keeps well-formed colours once, at most 12, and survives a throwing provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const plugin = fakePlugin('ext');
    const dice = host().api.connect(plugin).dice;
    const asked = vi.fn((collectionId: string) => [
      { name: `Fire ${collectionId}`, color: '#dd3333' }, { name: 'Fire A', color: '#DD3333' }, { name: 'Bad', color: 'red' },
      { name: '<b>x</b>', color: '#000000' }, { name: '', color: '#000000' }, 'nonsense',
    ]);
    dice.registerColours!(asked as never);
    dice.registerColours!(() => { throw new Error('boom'); });
    dice.registerColours!(() => Array.from({ length: 20 }, (_, i) => ({ name: `C${i}`, color: '#00000' + (i % 10) })));
    const colours = diceColoursFor('A');
    expect(asked).toHaveBeenCalledWith('A');
    expect(colours[0]).toEqual({ color: '#dd3333', colorName: 'Fire A' });
    expect(colours).toHaveLength(MAX_DICE_COLOURS);
    expect(error).toHaveBeenCalled();
    expect(diceColoursFor(null)).toEqual([]);
    plugin.unload();
  });
});

const die = (value: number, extra: Partial<RolledDie> = {}): RolledDie => ({ die: 'd6', value, max: 6, ...extra });

describe('tray dice in a colour', () => {
  it('tags dice one for one in formula order, an exploded die taking the tag of the die it exploded from', () => {
    const roll = { rolls: [die(6), die(3, { exploded: true }), die(2)] };
    expect(withDieTags(roll, [FIRE, ICE]).rolls.map((d) => d.colorName)).toEqual(['Fire', 'Fire', 'Ice']);
    expect(withDieTags(roll, [null, ICE]).rolls.map((d) => d.colorName)).toEqual([undefined, undefined, 'Ice']);
  });

  it('keeps the formula order: kinds ascending, each in the order added; − takes the last of a kind back', () => {
    let picks = addPick([], 20, FIRE);
    picks = addPick(picks, 6, ICE);
    picks = addPick(picks, 6, null);
    picks = addPick(picks, 20, null);
    expect(trayTags(picks)).toEqual([ICE, null, FIRE, null]);
    expect(trayTags(removePick(picks, 6))).toEqual([ICE, FIRE, null]);
    expect(taggedGroups(picks)).toEqual([{ tag: FIRE, dice: '1d20' }, { tag: ICE, dice: '1d6' }]);
  });

  it('a roll from Atlas\'s dice tool carries the tags before anyone hears it', () => {
    const bus = new EventEmitter();
    const heard: RolledDie[][] = [];
    bus.on('dice-rolled', (result: { rolls: RolledDie[] }) => heard.push(result.rolls));
    const tool = new DiceTool(bus, () => DEFAULT_DICE_RULES, offlineDiceInputs());
    tool.rollDice('1d6 + 1d20', undefined, undefined, [FIRE, null]);
    expect(heard[0]!.map((d) => d.colorName)).toEqual(['Fire', undefined]);
    tool.rollDice('1d6', undefined, undefined, [{ color: 'red', colorName: 'Fire' }]);
    expect(heard[1]![0]).not.toHaveProperty('color');
  });

  it('shows no picker without colours, and adds dice in the colour picked', () => {
    const onRoll = vi.fn(() => true);
    const { rerender } = render(<DiceTray onRoll={onRoll} />);
    expect(screen.queryByRole('group', { name: 'Colour of the next dice' })).toBeNull();
    rerender(<DiceTray onRoll={onRoll} colours={[FIRE, ICE]} />);
    expect(screen.getByRole('button', { name: 'No colour' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByLabelText(/^Add a d20/));
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    fireEvent.click(screen.getByLabelText(/^Add a d6/));
    fireEvent.click(screen.getByLabelText(/^Add a d6/));
    expect(screen.getByText('Fire: 2d6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith('2d6 + 1d20', { 6: 2, 20: 1 }, 0, [FIRE, FIRE, null]);
    expect(document.querySelector('[title]')).toBeNull();
  });
});
