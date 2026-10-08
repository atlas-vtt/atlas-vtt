import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeFields } from '../../src/app/react/components/collection-settings/InitiativeFields';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

describe('the collection settings\' initiative fields', () => {
  it('offers an automatic modifier field and accepts a custom statblock path', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InitiativeFields initiative={TURN_ORDER} onChange={onChange} />);
    const input = screen.getByLabelText<HTMLInputElement>('Statblock Modifier Field');
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'combat.initiative' } });
    expect(onChange).toHaveBeenCalledWith({ ...TURN_ORDER, modifierField: 'combat.initiative' });
    rerender(<InitiativeFields initiative={{ ...TURN_ORDER, modifierField: 'combat.initiative' }} onChange={onChange} />);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...TURN_ORDER, modifierField: '' });
  });
  it('offers the roll in turn order and passes on what is typed', () => {
    const onChange = vi.fn();
    render(<InitiativeFields initiative={TURN_ORDER} onChange={onChange} />);

    expect(screen.queryByText('Acts First')).toBeNull();
    fireEvent.change(screen.getByLabelText('Initiative Roll'), { target: { value: '1d10' } });
    expect(onChange).toHaveBeenCalledWith({ ...TURN_ORDER, roll: '1d10' });
  });

  it('says so while the roll is no dice', () => {
    render(<InitiativeFields initiative={{ ...TURN_ORDER, roll: '1d' }} onChange={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toMatch(/one group of dice/);
    expect(screen.getByLabelText('Initiative Roll').getAttribute('aria-invalid')).toBe('true');
  });

  it('offers the side that acts first, and no roll, by sides', () => {
    render(<InitiativeFields initiative={{ ...TURN_ORDER, mode: 'sides' }} onChange={vi.fn()} />);

    expect(screen.queryByLabelText('Initiative Roll')).toBeNull();
    expect(screen.queryByLabelText('Statblock Modifier Field')).toBeNull();
    expect(screen.getByText('Acts First')).toBeDefined();
    expect(screen.getByText(/Nothing is rolled/)).toBeDefined();
  });
});
