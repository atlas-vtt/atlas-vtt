// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { advantageSidesFor, ruledSides } from '../../src/app/tools/diceAdvantage';
import type { TrayAdvantage } from '../../src/app/react/components/dice/DiceTray';
import { renderDiceTray } from '../helpers/renderDiceTray';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;
const advantage: TrayAdvantage = { sides: ruledSides(d20), applies: (formula) => advantageSidesFor(formula, d20).length > 0, dice: 'd20' };
const precedes = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('dice tray layout', () => {
  it('stands dice, then formula and modifier, then the side, then history and share in one row, then Roll', () => {
    renderDiceTray({ advantage, shareRolls: { shown: true, onToggle: () => undefined }, historyOpen: true });
    const order = [
      screen.getByRole('button', { name: 'd20' }),
      screen.getByRole('textbox', { name: 'Formula' }),
      screen.getByRole('textbox', { name: 'Modifier' }),
      screen.getByRole('radiogroup'),
      screen.getByRole('button', { name: /^Roll history/ }),
      screen.getByRole('switch', { name: 'Show my rolls to players' }),
      screen.getByRole('list', { name: 'Roll history' }),
      screen.getByRole('button', { name: 'Roll' }),
    ];
    for (let i = 1; i < order.length; i++) expect(precedes(order[i - 1]!, order[i]!)).toBe(true);
    // The history's toggle and the switch share one row.
    expect(screen.getByRole('button', { name: /^Roll history/ }).parentElement).toBe(screen.getByRole('switch').closest('.atlas-dice-tray__bar'));
  });

  it('keeps Clear standing, disabled while there is nothing to clear, so Roll never changes width', () => {
    renderDiceTray();
    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Roll' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
