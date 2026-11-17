// @vitest-environment jsdom
import React from 'react';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceTool } from '../../src/app/tools/DiceTool';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

// The view store's dice log, as the dice log keeps it: newest first, fed by the dice tool's rolls.
const store = vi.hoisted(() => ({ diceLog: [] as DiceRollResult[], local: new Map<string, unknown>() }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    app: { loadLocalStorage: (key: string) => store.local.get(key) ?? null, saveLocalStorage: (key: string, value: unknown) => store.local.set(key, value) },
    view: { getViewType: () => 'atlas-vtt' },
  }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: { isPlayerView: boolean; diceLog: DiceRollResult[] }) => unknown) => selector({ isPlayerView: false, diceLog: store.diceLog }),
}));
vi.mock('../../src/app/keyboard/mapHotkeys', () => ({ canRunMapHotkeys: () => true }));
vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
beforeEach(() => { store.diceLog = []; store.local.clear(); });
afterEach(cleanup);

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;

/** The real path: a real dice tool, its rolls landing in the dice log, the dropdown opening and closing as the toolbar button makes it. */
function harness(): { reopen: () => void; tool: DiceTool } {
  const bus = new EventEmitter();
  const tool = new DiceTool(bus, () => d20, { random: () => 0.5, rollId: () => crypto.randomUUID(), roller: () => 'GM', onFormulaError: () => undefined });
  let open = true;
  const view = render(<div />);
  const draw = (): void => view.rerender(<DiceDropdownMenu diceTool={tool} isOpen={open} onToggle={() => { open = !open; draw(); }} />);
  bus.on('dice-rolled', (result: DiceRollResult) => { store.diceLog = [result, ...store.diceLog]; draw(); });
  draw();
  return { tool, reopen: () => { open = true; draw(); } };
}

const toggle = (): HTMLElement => screen.getByRole('button', { name: /^Roll history/ });
const list = (): HTMLElement => screen.getByRole('list', { name: 'Roll history' });

describe('the roll history through the real tray', () => {
  it('lists the dice log\'s rolls, newest first, and rolls one again from its row', () => {
    const { reopen, tool } = harness();
    fireEvent.click(screen.getByRole('button', { name: 'd6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    reopen();
    fireEvent.change(screen.getByRole('textbox', { name: 'Formula' }), { target: { value: '2d6 + 3' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Formula' }), { key: 'Enter' });
    reopen();
    fireEvent.click(screen.getByRole('button', { name: 'd100' }), { shiftKey: true });
    expect(toggle().textContent).toContain('3');
    fireEvent.click(toggle());
    const rows = within(list()).getAllByRole('listitem').map((row) => row.querySelector('.atlas-dice-tray__history-formula')?.textContent);
    expect(rows).toEqual(['1d100', '2d6 + 3', '1d6']);

    // A row rolls again and closes the tray, as Roll does; only Shift-click keeps it open.
    fireEvent.click(within(list()).getAllByRole('listitem')[2]!);
    expect(tool.state.rollHistory[0]?.formula).toBe('1d6');
    expect(screen.queryByRole('list', { name: 'Roll history' })).toBeNull();
    reopen();
    fireEvent.click(screen.getByRole('button', { name: 'Roll 2d6 + 3 again' }));
    expect(tool.state.rollHistory[0]?.formula).toBe('2d6 + 3');
  });

  it('remembers on this device whether the history stands open', () => {
    harness();
    fireEvent.click(toggle());
    expect(store.local.get('atlas-vtt-dice-tray-history-open')).toBe(true);
    cleanup();
    harness();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('rolls the newest again with Enter and Roll while the tray is empty, as Roll says', () => {
    const { reopen, tool } = harness();
    fireEvent.click(screen.getByRole('button', { name: 'd20' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    reopen();
    const again = screen.getByRole('button', { name: /^Roll 1d20 \+ 1 again/ }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(tool.state.rollHistory.map((roll) => roll.formula)).toEqual(['1d20 + 1', '1d20 + 1']);
  });
});
