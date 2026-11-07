// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL: the dice show as flat tiles.
vi.mock('../../../src/app/dice3d/dieImages', () => ({ dieImage: () => null, drawDieImages: async () => undefined }));
import { restingAspect } from '../../../src/app/dice3d/diceScene';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { COLLECTION_DICE_ID } from '../../../src/app/gameSystems/diceSetResolution';
import { TooltipProvider } from '../../../src/app/packages/components/primitives/tooltip';
import { DiceTab } from '../../../src/app/react/components/collection-settings/DiceTab';
import { diceSetFacts } from '../../../src/app/react/components/collection-settings/dice-lab/diceSetFacts';
import { placeStack, stackOfDice } from '../../../src/app/react/components/collection-settings/dice-lab/diceStack';
import { gridStep } from '../../../src/app/react/components/collection-settings/dice-lab/gridKeys';
import { SidesStep } from '../../../src/app/react/components/collection-settings/dice-lab/SidesStep';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';

afterEach(cleanup);

/** Facts with plain spaces, as they read. */
const facts = (set: DiceSet): string[] => diceSetFacts(set).map((fact) => fact.replace(/ /g, ' '));
const builtIn = (id: string): DiceSet => BUILT_IN_DICE_SETS.find((set) => set.id === `builtin:${id}`)!;

const DUALITY: DiceSet = {
  id: 'duality', name: 'Duality', builtIn: false, crit: 'doubles',
  dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }],
  advantage: { kind: 'die', sides: 6 }, disadvantage: { kind: 'die', sides: 6 },
};
const HORDE: DiceSet = {
  id: 'horde', name: 'Horde', builtIn: false, crit: 'natural',
  dice: [{ count: 9, sides: 6 }, { count: 5, sides: 8, colour: '#4d7c0f' }, { count: 4, sides: 20 }],
};

describe('a dice set\'s facts', () => {
  it('say the roll with the names of its dice, when it crits and what advantage does', () => {
    expect(facts(DUALITY)).toEqual(['Hope d12 + Fear d12', 'crits on doubles', 'advantage +d6']);
    expect(facts(builtIn('power-roll'))).toEqual(['2d10', 'crits on 19–20', 'advantage +2']);
    expect(facts(HORDE)).toEqual(['9d6 + 5d8 + 4d20', 'crits on the highest face']);
  });

  it('leave the roll out where the name says it', () => {
    expect(facts(builtIn('d20'))).toEqual(['crits on a natural 20', 'advantage keeps the best']);
    expect(facts(builtIn('d20-roll-under'))).toEqual(['rolls under, crits on a 1', 'advantage keeps the best']);
    expect(facts(builtIn('d10-exploding'))).toEqual(['crits on a natural 10', 'explodes on 10']);
    // A word of its own: `d100 roll-under` does not say `d10`
    expect(facts({ ...builtIn('d100-roll-under'), dice: [{ count: 1, sides: 10 }] })[0]).toBe('d10');
  });

  it('say disadvantage where only that side is set, and the other rules in short', () => {
    expect(facts({ ...HORDE, crit: 'none', disadvantage: { kind: 'number', value: 2 } })).toEqual(['9d6 + 5d8 + 4d20', 'never crits', 'disadvantage −2']);
    expect(facts({ ...builtIn('d100-roll-under'), advantage: { kind: 'keep', tensOnly: true } })).toContain('advantage adds a tens die');
    expect(facts({ ...HORDE, explode: { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 } })).toContain('every die explodes');
  });
});

describe('a set\'s dice stack', () => {
  it('shows every kind of die before any twice, in the set\'s order, and counts the rest', () => {
    expect(stackOfDice(HORDE.dice, 4)).toEqual({ dice: [{ sides: 6 }, { sides: 6 }, { sides: 8, colour: '#4d7c0f' }, { sides: 20 }], more: 14 });
    expect(stackOfDice(DUALITY.dice, 4).dice.map((die) => die.colour)).toEqual(['#ca8a04', '#7e22ce']);
    expect(stackOfDice([{ count: 1, sides: 20 }], 4)).toEqual({ dice: [{ sides: 20 }], more: 0 });
  });

  it('overlaps its dice inside the column, shrinking them only where they would not fit', () => {
    for (const aspects of [[1], [1, 1], [1, 1, 1, 1], [restingAspect(100)], [restingAspect(100), 1, 1, 1]]) {
      const { height, lefts } = placeStack(aspects, 80, 48);
      const right = Math.max(...lefts.map((left, i) => left + aspects[i]! * height));
      expect(lefts[0]).toBeGreaterThanOrEqual(-0.01);
      expect(right).toBeLessThanOrEqual(80.01);
      for (let i = 1; i < lefts.length; i++) expect(lefts[i]! - lefts[i - 1]!).toBeLessThan(aspects[i - 1]! * height);
    }
    expect(placeStack([1, 1], 80, 48).height).toBe(48);
    expect(placeStack([restingAspect(100), 1, 1, 1], 80, 48).height).toBeLessThan(48);
  });

  it('knows a d100\'s picture is two dice wide before it is drawn', () => {
    expect(restingAspect(20)).toBe(1);
    expect(restingAspect(100)).toBeGreaterThan(1.8);
  });
});

describe('arrow keys across a picker', () => {
  it('move along a list and a grid, stopping at the ends', () => {
    expect(gridStep('ArrowDown', 0, 3)).toBe(1);
    expect(gridStep('ArrowDown', 2, 3)).toBe(2);
    expect(gridStep('ArrowRight', 1, 3)).toBe(1);
    expect(gridStep('End', 0, 3)).toBe(2);
    expect(gridStep('ArrowDown', 1, 8, 4)).toBe(5);
    expect(gridStep('ArrowDown', 5, 8, 4)).toBe(5);
    expect(gridStep('Tab', 0, 3)).toBeNull();
  });
});

describe('the Dice tab', () => {
  const sets = [...BUILT_IN_DICE_SETS, DUALITY, HORDE];
  const tab = (current: DiceSet, onPick = vi.fn()): ReturnType<typeof vi.fn> => {
    render(<TooltipProvider><DiceTab diceSet={current} diceSets={{ service: null, sets }} onPick={onPick} /></TooltipProvider>);
    return onPick;
  };

  it('picks the default dice from the same picker: one change of the draft per pick', () => {
    const onPick = tab(builtIn('d20'));
    const list = screen.getByRole('listbox', { name: 'Default dice' });
    expect(within(list).getAllByRole('option')).toHaveLength(sets.length);
    expect(within(list).getByRole('option', { selected: true }).getAttribute('aria-label')).toMatch(/^d20, Built-in/);
    fireEvent.click(within(list).getByRole('option', { name: /^Duality, Hope d12 \+ Fear d12/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(DUALITY);
  });

  it('lists the collection\'s own dice first where no set of the library rolls them', () => {
    const own: DiceSet = { id: COLLECTION_DICE_ID, name: '3d6', builtIn: false, crit: 'none', dice: [{ count: 3, sides: 6 }] };
    const onPick = tab(own);
    const options = screen.getAllByRole('option');
    expect(options[0]?.getAttribute('aria-label')).toBe('This collection\'s dice, 3d6, never crits');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    // Moving focus picks nothing; Enter picks
    options[0]!.focus();
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.keyDown(options[1]!, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(builtIn('d20'));
  });
});

describe('the Sides step', () => {
  const step = (sides: number): { onChange: ReturnType<typeof vi.fn> } => {
    const onChange = vi.fn();
    render(<SidesStep die={{ id: 'a', sides, name: 'Hope', colour: '#ca8a04' }} onChange={onChange} onDone={vi.fn()} />);
    return { onChange };
  };
  const tile = (name: string): HTMLElement => screen.getByRole('button', { name });

  it('offers the common dice as tiles, the die\'s own pressed and the one Tab stop', () => {
    const { onChange } = step(12);
    expect(tile('d12').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button').filter((button) => button.tabIndex === 0)).toEqual([tile('d12')]);
    fireEvent.click(tile('d8'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ sides: 8 }, 'now');
    fireEvent.click(tile('d12'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves across the grid with the arrow keys: down from the d10 to the d100 that spans two columns', () => {
    const { onChange } = step(4);
    tile('d4').focus();
    fireEvent.keyDown(tile('d4'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tile('d6'));
    fireEvent.keyDown(tile('d6'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tile('d20'));
    fireEvent.keyDown(tile('d20'), { key: 'ArrowUp' });
    fireEvent.keyDown(tile('d6'), { key: 'End' });
    expect(document.activeElement).toBe(tile('d100'));
    fireEvent.keyDown(tile('d100'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tile('d8'));
    tile('d10').focus();
    fireEvent.keyDown(tile('d10'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tile('d100'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows other sides in their own row, marked chosen while the die has them', () => {
    const { onChange } = step(7);
    expect(screen.getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(false);
    const other = screen.getByRole('spinbutton', { name: /Other/ });
    expect((other as HTMLInputElement).value).toBe('7');
    expect(other.closest('.atlas-dice-lab__other')?.classList.contains('atlas-selected')).toBe(true);
    fireEvent.change(other, { target: { value: '13' } });
    expect(onChange).toHaveBeenCalledWith({ sides: 13 }, 'typing');
  });
});
