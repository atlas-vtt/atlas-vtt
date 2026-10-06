import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

describe('dice tray rejection', () => {
  it('keeps the selected dice when the roll is refused', () => {
    const onRoll = vi.fn(() => false);
    render(<DiceTray onRoll={onRoll} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a d6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith('1d6');
    expect(screen.getByRole('status').textContent).toBe('1d6');
  });
  it('clears the tray after an accepted roll', () => {
    render(<DiceTray onRoll={() => true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a d6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(screen.getByRole('status').textContent).toBe('The tray is empty.');
  });
});
