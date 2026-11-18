// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import type { TrayAdvantage } from '../../src/app/react/components/dice/DiceTray';
import { advantageSidesFor, ruledSides } from '../../src/app/tools/diceAdvantage';
import { loggedRoll, renderDiceTray } from '../helpers/renderDiceTray';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;
const advantage: TrayAdvantage = { sides: ruledSides(d20), applies: (formula) => advantageSidesFor(formula, d20).length > 0, dice: 'd20' };
const choice = (name: string): HTMLElement => screen.getByRole('radio', { name });

describe('advantage in the dice tray', () => {
  it('rolls the next roll with the side chosen, then lies at Normal again', () => {
    const { onRoll, remembered } = renderDiceTray({ advantage });
    fireEvent.click(screen.getByRole('button', { name: 'd20' }));
    fireEvent.click(choice('Advantage'));
    // The choice shows the side; the line under the field stays quiet while the formula can be rolled.
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith({ formula: '1d20', advantage: 'advantage' });
    cleanup();
    renderDiceTray({ advantage, memory: remembered(), history: [loggedRoll('1d20', 14, 'advantage')], historyOpen: true });
    expect(choice('Normal').getAttribute('aria-checked')).toBe('true');
    // The history names the side in the result's words.
    expect(within(screen.getByRole('list', { name: 'Roll history' })).getByRole('button', { name: 'Roll 1d20 · Advantage again' })).toBeTruthy();
  });

  it('chooses one side at a time', () => {
    renderDiceTray({ advantage });
    fireEvent.click(screen.getByRole('button', { name: 'd20' }));
    fireEvent.click(choice('Advantage'));
    fireEvent.click(choice('Disadvantage'));
    expect(choice('Advantage').getAttribute('aria-checked')).toBe('false');
    expect(choice('Disadvantage').getAttribute('aria-checked')).toBe('true');
  });

  it('shows Normal and holds the sides off for dice the set\'s rule does not change, and rolls them plainly', () => {
    const { onRoll } = renderDiceTray({ advantage });
    fireEvent.click(choice('Advantage'));
    fireEvent.click(screen.getByRole('button', { name: 'd6' }));
    expect(choice('Normal').getAttribute('aria-checked')).toBe('true');
    expect(choice('Advantage').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith({ formula: '1d6', advantage: null });
  });

  it('keeps the side while a refused roll stays in the tray', () => {
    renderDiceTray({ advantage, accepts: false });
    fireEvent.click(screen.getByRole('button', { name: 'd20' }));
    fireEvent.click(choice('Disadvantage'));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(choice('Disadvantage').getAttribute('aria-checked')).toBe('true');
  });

  it('chooses with N, A and D, and with the arrow keys as a radio group does, passing sides held off', () => {
    renderDiceTray({ advantage });
    fireEvent.click(screen.getByRole('button', { name: 'd20' }));
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(choice('Advantage').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(choice('Advantage'), { key: 'ArrowRight' });
    expect(choice('Disadvantage').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(choice('Normal').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'd20, 1 in the tray' }), { altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'd6' }));
    fireEvent.keyDown(choice('Normal'), { key: 'ArrowRight' });
    expect(choice('Normal').getAttribute('aria-checked')).toBe('true');
  });

  it('shows no choice where the set has no rule', () => {
    renderDiceTray();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
