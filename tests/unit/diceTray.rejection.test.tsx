// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderDiceTray } from '../helpers/renderDiceTray';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

const formula = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Formula' }) as HTMLInputElement;

describe('dice tray rejection', () => {
  it('keeps the selected dice when the roll is refused', () => {
    const { onRoll, onClose } = renderDiceTray({ accepts: false });
    fireEvent.click(screen.getByRole('button', { name: 'd6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith({ formula: '1d6', advantage: null });
    expect(formula().value).toBe('1d6');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('empties the tray and closes it after an accepted roll', () => {
    const { onClose, remembered } = renderDiceTray();
    fireEvent.click(screen.getByRole('button', { name: 'd6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(remembered()).toEqual({ formula: '', side: 'normal' });
  });

  it('refuses a formula the parser does not take, says why in place and rolls nothing', () => {
    const { onRoll } = renderDiceTray();
    fireEvent.change(formula(), { target: { value: '2d+banana' } });
    expect(formula().getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('“2d” is not a die or a number');
    fireEvent.keyDown(formula(), { key: 'Enter' });
    expect((screen.getByRole('button', { name: 'Roll' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onRoll).not.toHaveBeenCalled();
  });
});
