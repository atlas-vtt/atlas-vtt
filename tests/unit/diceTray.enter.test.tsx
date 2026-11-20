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

describe('Enter in the dice tray', () => {
  it('a press on a die neither focuses it nor leaves focus in a field of the tray', () => {
    renderDiceTray();
    const d20 = screen.getByRole('button', { name: 'd20' });
    formula().focus();
    expect(fireEvent.mouseDown(d20)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('a press in a field still focuses it', () => {
    renderDiceTray();
    expect(fireEvent.mouseDown(formula())).toBe(true);
  });

  it('rolls on any of its controls, a die included, instead of pressing it', () => {
    const { onRoll } = renderDiceTray();
    const d20 = screen.getByRole('button', { name: 'd20' });
    fireEvent.click(d20);
    expect(fireEvent.keyDown(d20, { key: 'Enter' })).toBe(false);
    expect(onRoll).toHaveBeenCalledWith({ formula: '1d20', advantage: null });
  });
});
