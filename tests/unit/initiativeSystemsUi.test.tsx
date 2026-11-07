// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeFields } from '../../src/app/react/components/collection-settings/InitiativeFields';
import { initiativeCardMenu, type CardMenuMode } from '../../src/app/react/components/initiativeCardMenu';
import { DealtCard } from '../../src/app/react/components/DealtCard';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
const CARDS: InitiativeRules = { mode: 'cards', roll: '1d20', firstSide: 'players' };
const ALLIES = { id: 'side-allies', name: 'Allies' };

const noop = (): void => undefined;
const actions = (overrides: Partial<Parameters<typeof initiativeCardMenu>[3]> = {}): Parameters<typeof initiativeCardMenu>[3] => ({
  roll: noop, moveToFront: noop, moveToBack: noop, edit: noop, updateToken: noop, setSitsOut: noop, swapCard: noop, delay: noop, actNow: noop, remove: noop, ...overrides,
});
const entry = { id: 'e', tokenId: 'wolf', name: 'Wolf', initiative: 0, initiativeModifier: 0, card: 4 } as InitiativeEntry;
const wolf = { id: 'wolf', kind: 'token', x: 0, y: 0, imagePath: '' } as TokenEntity;
const labels = (entries: ContextMenuEntry[]): string[] => entries.flatMap((e) => (e.type === 'custom' ? [] : [e.label]));
const childrenOf = (entries: ContextMenuEntry[], label: string): ContextMenuEntry[] => {
  const found = entries.find((e) => e.type === 'submenu' && e.label === label);
  if (found?.type !== 'submenu') throw new Error(`no ${label}`);
  return typeof found.children === 'function' ? found.children() : found.children;
};

const mode = (extra: Partial<CardMenuMode>): CardMenuMode => ({
  bySides: false, cards: false, fightRuns: true, swapTargets: [],
  sides: [{ id: 'players', name: 'Players' }, { id: 'opponents', name: 'Opponents' }],
  ...extra,
});

describe('the card menu of a fight with more than two sides', () => {
  it('offers every other side to move to', () => {
    const updateToken = vi.fn();
    const sides = [{ id: 'players', name: 'Players' }, { id: 'side-allies', name: 'Allies' }, { id: 'opponents', name: 'Opponents' }];
    const menu = initiativeCardMenu(entry, wolf, mode({ bySides: true, sides }), actions({ updateToken }));
    const targets = childrenOf(menu, 'Move to Side');
    expect(labels(targets)).toEqual(['Players', 'Allies']);
    const allies = targets[1]!;
    if (allies.type === 'item') void allies.onClick();
    expect(updateToken).toHaveBeenCalledWith({ side: 'side-allies' });
  });
});

describe('the card menu of a fight by cards', () => {
  it('swaps the card with another combatant, and has no number to roll, edit or delay', () => {
    const swapCard = vi.fn();
    const menu = initiativeCardMenu(entry, wolf, mode({ cards: true, swapTargets: [{ id: 'b', name: 'Bear', card: 7 }] }), actions({ swapCard }));
    expect(labels(menu)).not.toEqual(expect.arrayContaining(['Roll Initiative']));
    expect(labels(menu)).not.toContain('Edit Initiative');
    expect(labels(menu)).not.toContain('Delay Turn');
    const [bear] = childrenOf(menu, 'Swap Card With');
    expect(bear).toMatchObject({ label: 'Bear', detail: '7' });
    if (bear?.type === 'item') void bear.onClick();
    expect(swapCard).toHaveBeenCalledWith('b');
  });

  it('offers no swap to a combatant without a card', () => {
    const { card: _card, ...dealtNone } = entry;
    const menu = initiativeCardMenu(dealtNone, wolf, mode({ cards: true, swapTargets: [{ id: 'b', name: 'Bear', card: 7 }] }), actions());
    expect(labels(menu)).not.toContain('Swap Card With');
  });
});

describe('the card a combatant was dealt', () => {
  it('shows its number, or a dash before one is dealt, and names it for screen readers', () => {
    const { container, rerender } = render(<DealtCard card={7} />);
    expect(container.textContent).toBe('7Card 7');
    rerender(<DealtCard card={undefined} />);
    expect(container.querySelector('.atlas-initiative-card__dealt--none')?.textContent).toBe('–No card yet');
  });
});

describe('the initiative fields of a fight by cards', () => {
  it('sets the size of the deck and switches dealing every round and sharing look-alikes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={CARDS} onChange={onChange} />);
    expect(screen.getByLabelText<HTMLInputElement>('Cards in the deck').value).toBe('10');
    fireEvent.change(screen.getByLabelText('Cards in the deck'), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...CARDS, deck: 12 });
    fireEvent.click(screen.getByLabelText('Deal anew every round'));
    expect(onChange).toHaveBeenLastCalledWith({ ...CARDS, dealEachRound: true });
    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...CARDS, lookAlikesShare: true, deck: 1 }} onChange={onChange} />);
    expect(screen.getByRole('alert').textContent).toMatch(/2 to 50/);
    fireEvent.click(screen.getByLabelText('Look-alikes share a card'));
    expect(onChange).toHaveBeenLastCalledWith({ ...CARDS, deck: 1 });
  });
});

describe('the initiative fields of a fight by sides', () => {
  it('adds and names a side, and moves a side to act earlier', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={SIDES} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add side' }));
    const added = onChange.mock.lastCall![0] as InitiativeRules;
    expect(added.sides).toEqual([{ id: 'players' }, { id: 'opponents' }, { id: expect.stringMatching(/^side-/), name: '' }]);

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...SIDES, sides: [{ id: 'players' }, { id: 'opponents' }, { ...ALLIES, name: '' }] }} onChange={onChange} />);
    expect(screen.getByRole('alert').textContent).toMatch(/name/);
    fireEvent.change(screen.getByLabelText('Name of the side'), { target: { value: 'Allies' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...SIDES, sides: [{ id: 'players' }, { id: 'opponents' }, ALLIES] });

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...SIDES, sides: [{ id: 'players' }, { id: 'opponents' }, ALLIES] }} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Act earlier' })[1]!);
    expect(onChange).toHaveBeenLastCalledWith({ ...SIDES, firstSide: 'opponents', sides: [{ id: 'opponents' }, { id: 'players' }, ALLIES] });
    // The built-in sides stay
    expect(screen.getAllByRole<HTMLButtonElement>('button', { name: 'Remove side' }).map((button) => button.disabled)).toEqual([true, true, false]);
  });

  it('rolls for the order with a d6 once switched on, and keeps the order buttons while the order is rolled, disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={SIDES} onChange={onChange} />);
    expect(screen.getByLabelText<HTMLInputElement>('Side roll').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Roll for the order every round'));
    expect(onChange).toHaveBeenLastCalledWith({ ...SIDES, sideRoll: '1d6' });

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...SIDES, sideRoll: '1d6' }} onChange={onChange} />);
    expect(screen.getAllByRole<HTMLButtonElement>('button', { name: /Act (earlier|later)/ }).every((button) => button.disabled)).toBe(true);
    fireEvent.click(screen.getByLabelText('Roll for the order every round'));
    expect(onChange).toHaveBeenLastCalledWith(SIDES);
  });
});
