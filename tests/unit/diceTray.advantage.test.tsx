// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { DiceTray, type TrayAdvantage } from '../../src/app/react/components/dice/DiceTray';
import { advantageSidesFor, ruledSides } from '../../src/app/tools/diceAdvantage';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;
const advantage: TrayAdvantage = { sides: ruledSides(d20), applies: (formula) => advantageSidesFor(formula, d20).length > 0 };
const choice = (name: string): HTMLElement => screen.getByRole('radio', { name });

describe('advantage in the dice tray', () => {
  it('rolls the next roll with the side chosen, then lies at Normal again', () => {
    const onRoll = vi.fn(() => true);
    render(<DiceTray onRoll={onRoll} advantage={advantage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a d20' }));
    fireEvent.click(choice('Advantage'));
    expect(screen.getByRole('status').textContent).toBe('1d20 · Advantage');
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith('1d20', 'advantage');
    expect(choice('Normal').getAttribute('aria-checked')).toBe('true');
  });

  it('chooses one side at a time', () => {
    render(<DiceTray onRoll={vi.fn()} advantage={advantage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a d20' }));
    fireEvent.click(choice('Advantage'));
    fireEvent.click(choice('Disadvantage'));
    expect(choice('Advantage').getAttribute('aria-checked')).toBe('false');
    expect(choice('Disadvantage').getAttribute('aria-checked')).toBe('true');
  });

  it('stands disabled for dice the set\'s rule does not change, and rolls them plainly', () => {
    const onRoll = vi.fn(() => true);
    render(<DiceTray onRoll={onRoll} advantage={advantage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a d6' }));
    expect((choice('Advantage') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith('1d6', null);
  });

  it('keeps the side while a refused roll stays in the tray', () => {
    render(<DiceTray onRoll={() => false} advantage={advantage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a d20' }));
    fireEvent.click(choice('Disadvantage'));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(choice('Disadvantage').getAttribute('aria-checked')).toBe('true');
  });

  it('shows no choice where the set has no rule', () => {
    render(<DiceTray onRoll={vi.fn()} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
