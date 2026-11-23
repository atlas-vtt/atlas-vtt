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

/** Chooses `item` in a saved roll's ⋯ menu. */
function choose(roll: string, item: string): void {
  // The ⋯ takes its name from its tooltip, which these tests leave out: it is found on its card.
  const card = screen.getByRole('button', { name: new RegExp(`^Roll ${roll}:`) }).closest('li')!;
  // Not with Enter: Enter anywhere in the tray rolls, on its ⋯ too.
  fireEvent.keyDown(card.querySelector('.atlas-dice-presets__more')!, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
}

const trayFormula = (): HTMLInputElement => document.querySelector<HTMLInputElement>('.atlas-dice-tray__formula')!;

describe('saved rolls through the real tray', () => {
  it('keeps a formula the dice cannot show as written: rolled from the panel, pinned, added to the tray as one term', () => {
    const { tool, draw } = harness();
    fireEvent.change(trayFormula(), { target: { value: '4d6kh3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saved rolls' }));
    const panel = screen.getByRole('region', { name: 'Saved rolls' });
    expect(within(panel).getByRole('textbox', { name: 'Formula' })).toHaveProperty('value', '4d6kh3');
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Name' }), { target: { value: 'Stat line' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roll' }));
    draw();
    expect(store.settings.dicePresets?.map(({ name, formula, look }) => ({ name, formula, look }))).toEqual([{ name: 'Stat line', formula: '4d6kh3', look: undefined }]);
    // Saving opens the roll's editor; a formula the dice cannot show keeps its field there.
    expect(screen.getByRole('region', { name: 'Edit Stat line' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    draw();

    fireEvent.click(within(screen.getByRole('region', { name: 'Saved rolls' })).getByRole('button', { name: 'Roll Stat line: 4d6kh3' }));
    expect(tool.state.rollHistory[0]?.formula).toBe('4d6kh3');

    choose('Stat line', 'Put in the dice row');
    draw();
    // The eighth place: its number key adds it to the tray, before the modifier.
    fireEvent.change(trayFormula(), { target: { value: '1d20 + 2' } });
    fireEvent.keyDown(document.body, { key: '8' });
    expect(trayFormula().value).toBe('1d20 + (4d6kh3) + 2');
    // The saved roll's dice are its own: the d6 shows none held.
    expect(screen.getByRole('button', { name: 'd6' })).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Stat line, 1 in the tray' }));
    expect(trayFormula().value).toBe('1d20 + 2');
  });

  it('turns plain dice into dice to dress, rolled as their own set, at once from the row', () => {
    const { tool, draw } = harness();
    fireEvent.change(trayFormula(), { target: { value: '1d8[slashing] + 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saved rolls' }));
    const panel = screen.getByRole('region', { name: 'Saved rolls' });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Name' }), { target: { value: 'Longsword' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roll' }));
    draw();
    const [saved] = store.settings.dicePresets!;
    expect(saved).toMatchObject({ name: 'Longsword', formula: '+3', look: { dice: [{ count: 1, sides: 8, name: 'slashing' }], crit: 'natural' } });
    expect(screen.getByRole('region', { name: 'Edit Longsword' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Edit Longsword' })).getByRole('textbox', { name: 'Modifier' })).toHaveProperty('value', '+3');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    choose('Longsword', 'Put in the dice row');
    draw();
    fireEvent.change(trayFormula(), { target: { value: '1d20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
    // It rolls at once with its own dice, and leaves what the tray holds as it was.
    expect(tool.state.rollHistory[0]).toMatchObject({ formula: '1d8+3', diceSet: { name: 'Longsword' } });
    expect(trayFormula().value).toBe('1d20');
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

  it('edits the row in place: E starts it, × takes a die out, + adds one, Alt+arrow moves one, Escape ends it', () => {
    const { draw } = harness();
    fireEvent.keyDown(document.body, { key: 'e' });
    const row = (): HTMLElement => screen.getByRole('group', { name: 'Dice row' });
    fireEvent.click(within(row()).getByRole('button', { name: 'Take d100 out of the row' }));
    draw();
    fireEvent.click(within(row()).getByRole('button', { name: 'Add die' }));
    const field = within(row()).getByRole('textbox', { name: 'Add die' });
    fireEvent.change(field, { target: { value: 'd3' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    draw();
    expect(store.settings.diceRow?.at(-1)).toEqual({ kind: 'die', sides: 3 });
    // A die the row already has stays out, and the row says why.
    fireEvent.click(within(row()).getByRole('button', { name: 'Add die' }));
    const again = within(row()).getByRole('textbox', { name: 'Add die' });
    fireEvent.change(again, { target: { value: 'd20' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(document.querySelector('.atlas-dice-tray__row-note')?.textContent).toBe('d20 is already in the row');
    fireEvent.change(again, { target: { value: '' } });
    fireEvent.blur(again);
    fireEvent.keyDown(within(row()).getByRole('img', { name: /^d3,/ }), { key: 'ArrowLeft', altKey: true });
    draw();
    expect(store.settings.diceRow?.slice(-2)).toEqual([{ kind: 'die', sides: 3 }, { kind: 'die', sides: 20 }]);
    // While the row is edited a die's number key adds nothing, and Enter rolls nothing.
    fireEvent.keyDown(document.body, { key: '1' });
    expect(trayFormula().value).toBe('');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Dice row' })).toBeNull();
    expect(screen.getByRole('button', { name: 'd3' })).toBeTruthy();
  });

  it('keeps a set of the Dice Lab as a saved roll, its dice and rules copied, and opens it to dress', () => {
    const { draw } = harness();
    fireEvent.click(screen.getByRole('button', { name: 'Saved rolls' }));
    fireEvent.click(screen.getByRole('button', { name: 'From the Dice Lab' }));
    const offered = within(screen.getByRole('list', { name: 'From the Dice Lab' })).getAllByRole('button');
    expect(offered.length).toBeGreaterThan(0);
    const name = offered[0]!.querySelector('.atlas-dice-presets__name')!.textContent!;
    fireEvent.click(offered[0]!);
    draw();
    expect(store.settings.dicePresets?.[0]).toMatchObject({ name, formula: '' });
    expect(store.settings.dicePresets?.[0]?.look?.dice.length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: `Edit ${name}` })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Saved rolls' })).toBeTruthy();
  });

  it('stays open for a press or Escape in a menu a choice opened elsewhere in the document', () => {
    let closed = 0;
    const tool = new DiceTool(new EventEmitter(), () => d20, { random: () => 0.5, rollId: () => crypto.randomUUID(), roller: () => 'GM', onFormulaError: () => undefined });
    render(<DiceDropdownMenu diceTool={tool} isOpen onToggle={() => { closed += 1; }} />);
    const menu = document.createElement('div');
    menu.className = 'atlas-ctx-menu';
    const item = document.createElement('button');
    menu.append(item);
    document.body.append(menu);
    return new Promise<void>((resolve) => setTimeout(() => {
      fireEvent.pointerDown(item);
      fireEvent.keyDown(item, { key: 'Escape' });
      expect(closed).toBe(0);
      fireEvent.pointerDown(document.body);
      expect(closed).toBe(1);
      menu.remove();
      resolve();
    }, 0));
  });
});
