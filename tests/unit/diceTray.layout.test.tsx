import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

const precedes = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('dice tray layout', () => {
  it('shows the switch for sharing rolls under the dice, above the modifier and the formula', () => {
    render(<DiceTray onRoll={() => true} shareRolls={{ shown: true, onToggle: () => undefined }} />);

    const share = screen.getByRole('switch');
    expect(precedes(screen.getByRole('button', { name: 'Add a d20' }), share)).toBe(true);
    expect(precedes(share, screen.getByText('Modifier'))).toBe(true);
    expect(precedes(share, screen.getByRole('status'))).toBe(true);
  });
});
