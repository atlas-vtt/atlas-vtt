// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isValidDefaultRoll, parseExplodeRule } from '../../src/app/gameSystems/diceRules';
import { ExplodingDiceFields } from '../../src/app/react/components/collection-settings/ExplodingDiceFields';
import type { DiceRules } from '../../src/app/types/diceRulesTypes';

/** Whether a set could be saved with these rules: its exploding rule complete. */
const isValidDiceRules = (dice: DiceRules): boolean => isValidDefaultRoll(dice.defaultRoll) && (dice.explode === undefined || parseExplodeRule(dice.explode) !== null);

const rules = (explode: Partial<NonNullable<DiceRules['explode']>> = {}): DiceRules => ({
  defaultRoll: '1d10',
  crit: 'natural',
  explode: { dice: 'default', repeats: false, highFaces: 1, lowFaces: 1, ...explode },
});

describe('the face counts of exploding dice', () => {
  it('lets the field be emptied and typed anew', () => {
    const onChange = vi.fn<(dice: DiceRules) => void>();
    const { rerender } = render(<ExplodingDiceFields dice={rules()} onChange={onChange} />);
    const high = screen.getByLabelText<HTMLInputElement>('Highest faces that explode');

    fireEvent.change(high, { target: { value: '' } });
    const emptied = onChange.mock.lastCall![0];
    expect(emptied.explode?.highFaces).toBeNaN();

    // The empty field stays empty, says what it wants and holds nothing that could be saved.
    rerender(<ExplodingDiceFields dice={emptied} onChange={onChange} />);
    expect(high.value).toBe('');
    expect(high.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('1 to 99');
    expect(isValidDiceRules(emptied)).toBe(false);

    fireEvent.change(high, { target: { value: '2' } });
    expect(onChange.mock.lastCall![0].explode?.highFaces).toBe(2);
    expect(isValidDiceRules(onChange.mock.lastCall![0])).toBe(true);
  });

  it('keeps a number that is no face count as typed, and invalid', () => {
    const onChange = vi.fn<(dice: DiceRules) => void>();
    render(<ExplodingDiceFields dice={rules()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Highest faces that explode'), { target: { value: '0' } });
    expect(onChange.mock.lastCall![0].explode?.highFaces).toBe(0);
    expect(isValidDiceRules(onChange.mock.lastCall![0])).toBe(false);
  });

  it('keeps the lowest faces switched on while their field is empty', () => {
    render(<ExplodingDiceFields dice={rules({ lowFaces: NaN })} onChange={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Lowest face subtracts' }).checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Lowest faces that subtract').value).toBe('');
  });

  it('counts rules without exploding dice, and with a valid rule, as savable', () => {
    expect(isValidDiceRules({ defaultRoll: '1d20', crit: 'natural' })).toBe(true);
    expect(isValidDiceRules(rules())).toBe(true);
    expect(isValidDiceRules({ ...rules(), defaultRoll: '2d' })).toBe(false);
  });
});
