// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeFields } from '../../src/app/react/components/collection-settings/InitiativeFields';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

/** The modifier's field picker, a select named by its row. */
const modifierSelect = (): HTMLElement => screen.getByRole('combobox', { name: 'Modifier' });
/** Opens the modifier's picker and chooses the option whose name matches. */
function pickField(name: RegExp | string): void {
  fireEvent.click(modifierSelect());
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('the collection settings\' initiative fields', () => {
  it('offers the roll in turn order and passes on what is typed', () => {
    const onChange = vi.fn();
    render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);

    expect(screen.queryByText('Acts First')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Roll' }), { target: { value: '1d10' } });
    expect(onChange).toHaveBeenCalledWith({ ...TURN_ORDER, roll: '1d10' });
  });

  it('says so while the roll is no dice', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, roll: '1d' }} onChange={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toMatch(/one group of dice/);
    expect(screen.getByRole('textbox', { name: 'Roll' }).getAttribute('aria-invalid')).toBe('true');
  });

  it('lists the sides in the order they act, and no combatant\'s roll, by sides', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, mode: 'sides', firstSide: 'opponents' }} onChange={vi.fn()} />);

    expect(screen.queryByRole('textbox', { name: 'Roll' })).toBeNull();
    expect([...document.querySelectorAll('.atlas-csm-side__name')].map((name) => name.textContent)).toEqual(['Opponents', 'Players']);
  });

  it('keeps every explanation behind an info mark, so each setting is one row', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={vi.fn()} />);
    expect(screen.queryByText(/whose number is added to every roll/, { ignore: 'script, style, [hidden]' })).toBeNull();
    expect(document.querySelectorAll('.atlas-csm-setting .atlas-csm-info').length).toBeGreaterThanOrEqual(4);
  });

  it('offers the statblocks\' fields in groups, and passes on the one picked', () => {
    const onChange = vi.fn();
    const suggestions = [
      { path: 'dex_mod' }, { path: 'stats.1', label: 'Dex', score: true },
      { path: 'initiative', label: 'Initiative', recommended: true as const },
    ];
    render(<InitiativeFields fieldSuggestions={suggestions} initiative={TURN_ORDER} onChange={onChange} />);
    fireEvent.click(modifierSelect());
    const groups = screen.getAllByRole('group').map((group) => [group.getAttribute('aria-label'), [...group.querySelectorAll('[role="option"]')].map((o) => o.querySelector('.atlas-select-option-text')?.textContent)]);
    expect(groups).toEqual([['Suggested', ['Initiative']], ['Ability scores', ['Dex']], ['Other fields', ['dex_mod', 'Type a key…']]]);
    // A name, and no value: no one statblock's number speaks for the collection
    expect(screen.getByRole('option', { name: /Initiative/ }).textContent).toBe('Initiative');
    fireEvent.click(screen.getByRole('option', { name: /dex_mod/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'dex_mod' } });
  });

  it('takes a field the templates do not name from Other field, and no field from None', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);
    pickField('Type a key…');
    fireEvent.change(screen.getByRole('textbox', { name: 'Modifier' }), { target: { value: 'combat.init' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'combat.init' } });

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, modifier: { field: 'combat.init' } }} onChange={onChange} />);
    pickField('None');
    expect(onChange).toHaveBeenLastCalledWith(TURN_ORDER);
  });

  it('shows a field typed by hand in its own box, since no option names it', () => {
    render(<InitiativeFields fieldSuggestions={[{ path: 'initiative' }]} initiative={{ ...TURN_ORDER, modifier: { field: 'combat.init' } }} onChange={vi.fn()} />);
    expect(modifierSelect().textContent).toContain('Type a key…');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Modifier' }).value).toBe('combat.init');
  });

  it('offers no modifier by sides, where nothing is rolled', () => {
    render(<InitiativeFields fieldSuggestions={[{ path: 'initiative' }]} initiative={{ ...TURN_ORDER, mode: 'sides' }} onChange={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Modifier' })).toBeNull();
  });

  it('reads the field as an ability score once switched on, which needs a field', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'Read as ability score' }).getAttribute('aria-disabled')).toBe('true');

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, modifier: { field: 'dex' } }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Read as ability score' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'dex', abilityScore: true } });
  });

  it('shows the fallback a game system names, and removes it', () => {
    const onChange = vi.fn();
    const rules = { ...TURN_ORDER, modifier: { field: 'initiative' }, modifierFallback: { field: 'stats.1', abilityScore: true as const } };
    render(<InitiativeFields fieldSuggestions={[]} initiative={rules} onChange={onChange} />);
    expect(screen.getByText('stats.1, as ability score')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove fallback' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'initiative' } });
  });

  it('keeps the fallback while another field is picked', () => {
    const onChange = vi.fn();
    const rules = { ...TURN_ORDER, modifierFallback: { field: 'stats.1', abilityScore: true as const } };
    render(<InitiativeFields fieldSuggestions={[{ path: 'init' }]} initiative={rules} onChange={onChange} />);
    pickField(/^init/);
    expect(onChange).toHaveBeenLastCalledWith({ ...rules, modifier: { field: 'init' } });
  });

  it('picks a score\'s slot as an ability score, and another field as a modifier again', () => {
    const onChange = vi.fn();
    const suggestions = [{ path: 'stats.1', label: 'Dex', score: true }, { path: 'perception', label: 'Perception' }];
    const { rerender } = render(<InitiativeFields fieldSuggestions={suggestions} initiative={TURN_ORDER} onChange={onChange} />);
    pickField(/Dex/);
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'stats.1', abilityScore: true } });

    rerender(<InitiativeFields fieldSuggestions={suggestions} initiative={{ ...TURN_ORDER, modifier: { field: 'stats.1', abilityScore: true } }} onChange={onChange} />);
    pickField(/Perception/);
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'perception' } });
  });

  it('says how many of the collection\'s statblocks the field reads a modifier from, with one of them', () => {
    const statblocks = [
      { name: 'Goblin', fields: { perception: [{ name: 'Perception', desc: '+5' }] } },
      { name: 'Wolf', fields: { perception: '+7' } },
      { name: 'Commoner', fields: { hp: 4 } },
    ];
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} modifierStatblocks={statblocks}
      initiative={{ ...TURN_ORDER, modifier: { field: 'Perception' } }} onChange={vi.fn()} />);
    expect(screen.getByText('Reads a modifier from 2 of 3 statblocks, such as Goblin +5')).toBeDefined();

    rerender(<InitiativeFields fieldSuggestions={[]} modifierStatblocks={statblocks}
      initiative={{ ...TURN_ORDER, modifier: { field: 'dex' } }} onChange={vi.fn()} />);
    expect(screen.getByText('None of the collection\'s 3 statblocks has a number there')).toBeDefined();
  });
});
