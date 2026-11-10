// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeFields } from '../../src/app/react/components/collection-settings/InitiativeFields';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

describe('the collection settings\' initiative fields', () => {
  it('offers the roll in turn order and passes on what is typed', () => {
    const onChange = vi.fn();
    render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);

    expect(screen.queryByText('Acts First')).toBeNull();
    fireEvent.change(screen.getByLabelText('Initiative Roll'), { target: { value: '1d10' } });
    expect(onChange).toHaveBeenCalledWith({ ...TURN_ORDER, roll: '1d10' });
  });

  it('says so while the roll is no dice', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, roll: '1d' }} onChange={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toMatch(/one group of dice/);
    expect(screen.getByLabelText('Initiative Roll').getAttribute('aria-invalid')).toBe('true');
  });

  it('lists the sides in the order they act, and no combatant\'s roll, by sides', () => {
    render(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, mode: 'sides', firstSide: 'opponents' }} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Initiative Roll')).toBeNull();
    expect([...document.querySelectorAll('.atlas-csm-side__name')].map((name) => name.textContent)).toEqual(['Opponents', 'Players']);
  });

  it('passes on the statblock field typed for the modifier, and no field once it is cleared', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Modifier field'), { target: { value: 'combat.init' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'combat.init' } });

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, modifier: { field: 'x' } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Modifier field'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(TURN_ORDER);
  });

  it('offers the statblocks\' fields as chips, narrowed by what is typed', () => {
    const onChange = vi.fn();
    const suggestions = [{ path: 'initiative', label: 'Initiative' }, { path: 'dex_mod' }];
    const { rerender } = render(<InitiativeFields fieldSuggestions={suggestions} initiative={TURN_ORDER} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /dex_mod/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'dex_mod' } });

    rerender(<InitiativeFields fieldSuggestions={suggestions} initiative={{ ...TURN_ORDER, modifier: { field: 'ini' } }} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /dex_mod/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Initiative/ })).toBeDefined();
  });

  it('offers no modifier by sides, where nothing is rolled', () => {
    render(<InitiativeFields fieldSuggestions={[{ path: 'initiative' }]} initiative={{ ...TURN_ORDER, mode: 'sides' }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Modifier field')).toBeNull();
  });

  it('reads the field as an ability score once switched on, which needs a field', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields fieldSuggestions={[]} initiative={TURN_ORDER} onChange={onChange} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Ability score' }).disabled).toBe(true);

    rerender(<InitiativeFields fieldSuggestions={[]} initiative={{ ...TURN_ORDER, modifier: { field: 'dex' } }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ability score' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'dex', abilityScore: true } });
  });

  it('shows the fallback a game system names, and removes it', () => {
    const onChange = vi.fn();
    const rules = { ...TURN_ORDER, modifier: { field: 'initiative' }, modifierFallback: { field: 'stats.1', abilityScore: true as const } };
    render(<InitiativeFields fieldSuggestions={[]} initiative={rules} onChange={onChange} />);
    expect(screen.getByText(/stats\.1, read as an ability score/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove fallback' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'initiative' } });
  });

  it('keeps the fallback while the field is typed', () => {
    const onChange = vi.fn();
    const rules = { ...TURN_ORDER, modifierFallback: { field: 'stats.1', abilityScore: true as const } };
    render(<InitiativeFields fieldSuggestions={[]} initiative={rules} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Modifier field'), { target: { value: 'init' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...rules, modifier: { field: 'init' } });
  });

  it('picks a score\'s slot as an ability score, and another field as a modifier again', () => {
    const onChange = vi.fn();
    const suggestions = [{ path: 'stats.1', label: 'Dex', score: true, sample: '+3' }, { path: 'perception', label: 'Perception', sample: '+5' }];
    const { rerender } = render(<InitiativeFields fieldSuggestions={suggestions} initiative={TURN_ORDER} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Dex/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifier: { field: 'stats.1', abilityScore: true } });

    rerender(<InitiativeFields fieldSuggestions={suggestions} initiative={{ ...TURN_ORDER, modifier: { field: 'stats.1', abilityScore: true } }} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Perception/ }).textContent).toContain('+5');
    fireEvent.click(screen.getByRole('button', { name: /Perception/ }));
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
