// @vitest-environment jsdom
import React from 'react';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { readDiceShelf, type ShelfChange } from '../../src/app/react/components/dice/diceShelf';
import { DiceTool } from '../../src/app/tools/DiceTool';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

// The collection's settings, as the shelf hook reads and writes them.
const store = vi.hoisted(() => ({ settings: {} as Pick<CollectionSettings, 'dicePresets' | 'diceRow'>, local: new Map<string, unknown>() }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    app: { workspace: { on: () => ({}), offref: () => undefined }, loadLocalStorage: (key: string) => store.local.get(key) ?? null, saveLocalStorage: (key: string, value: unknown) => store.local.set(key, value) },
    view: { getViewType: () => 'atlas-vtt' },
  }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: { isPlayerView: boolean; diceLog: DiceRollResult[] }) => unknown) => selector({ isPlayerView: false, diceLog: [] }),
}));
vi.mock('../../src/app/react/components/dice/useDiceShelf', () => ({
  useDiceShelf: () => ({ shelf: readDiceShelf(store.settings), change: (change: ShelfChange) => { store.settings = { ...store.settings, ...change }; } }),
}));
// The first-run tour has its own tests; here it stays away.
vi.mock('../../src/app/onboarding/Tutorial', () => ({ Tutorial: (): null => null }));
vi.mock('../../src/app/keyboard/mapHotkeys', () => ({ canRunMapHotkeys: () => true }));
vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
beforeEach(() => { store.settings = {}; store.local.clear(); });
afterEach(cleanup);

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;

function harness(): { tool: DiceTool; draw: () => void } {
  const tool = new DiceTool(new EventEmitter(), () => d20, { random: () => 0.5, rollId: () => crypto.randomUUID(), roller: () => 'GM', onFormulaError: () => undefined });
  const view = render(<div />);
  const draw = (): void => view.rerender(<DiceDropdownMenu diceTool={tool} isOpen onToggle={() => undefined} />);
  draw();
  return { tool, draw };
}

const trayFormula = (): HTMLInputElement => document.querySelector<HTMLInputElement>('.atlas-dice-tray__formula')!;

describe('saved rolls through the real tray', () => {
  it('saves the tray\'s roll under a name, rolls it from the panel and pins it into the row', () => {
    const { tool, draw } = harness();
    fireEvent.click(screen.getByRole('button', { name: 'd12' }));
    fireEvent.click(screen.getByRole('button', { name: 'd12, 1 in the tray' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saved rolls' }));
    const panel = screen.getByRole('region', { name: 'Saved rolls' });
    expect(within(panel).getByRole('textbox', { name: 'Formula' })).toHaveProperty('value', '2d12');
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Name' }), { target: { value: 'Duality' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roll' }));
    draw();
    expect(store.settings.dicePresets?.map(({ name, formula }) => ({ name, formula }))).toEqual([{ name: 'Duality', formula: '2d12' }]);

    fireEvent.click(within(screen.getByRole('region', { name: 'Saved rolls' })).getByRole('button', { name: 'Roll Duality: 2d12' }));
    expect(tool.state.rollHistory[0]?.formula).toBe('2d12');

    fireEvent.click(screen.getByRole('button', { name: 'Put in the dice row' }));
    draw();
    // The eighth place: its number key adds it to the tray, before the modifier.
    fireEvent.change(trayFormula(), { target: { value: '1d20 + 2' } });
    fireEvent.keyDown(document.body, { key: '8' });
    expect(trayFormula().value).toBe('1d20 + 2d12 + 2');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Duality, 1 in the tray' }));
    expect(trayFormula().value).toBe('1d20 + 2');
  });

  it('refuses a roll without a name or one that cannot be rolled, and saves nothing', () => {
    harness();
    fireEvent.click(screen.getByRole('button', { name: 'Saved rolls' }));
    const panel = screen.getByRole('region', { name: 'Saved rolls' });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Formula' }), { target: { value: '1d6' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roll' }));
    expect(panel.textContent).toContain('Give the roll a name');
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Name' }), { target: { value: 'Too many' } });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Formula' }), { target: { value: '1d6 +' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roll' }));
    expect(store.settings.dicePresets).toBeUndefined();
  });

  it('shows the collection\'s own row: a d3 in place of the d100', () => {
    store.settings = { diceRow: [{ kind: 'die', sides: 20 }, { kind: 'die', sides: 3 }] };
    harness();
    expect(screen.queryByRole('button', { name: 'd100' })).toBeNull();
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: '1' });
    expect(trayFormula().value).toBe('1d3 + 1d20');
  });
});
