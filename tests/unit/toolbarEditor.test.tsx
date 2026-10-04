import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { canRunMapHotkeys, matchesMapHotkey } from '../../src/app/keyboard/mapHotkeys';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import { handle, renderToolbar, setUpToolbarTestDom, startEditing } from './toolbarEditorHarness';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/utils/activeLeafGuard', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/utils/activeLeafGuard')>(),
  isShortcutScopeActive: () => true,
  isActiveAtlasLeaf: () => true,
}));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

// Every control keeps a slot in the tray; those of tools on the bar are hidden.
const trayIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-tray-item]:not([hidden])')).map(item => item.dataset.trayItem ?? '');

const liveRegion = (container: HTMLElement): string => container.querySelector('[role="status"]')?.textContent ?? '';

const paletteButton = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[data-toolbar-item="palette"] button');

/** What the map's own shortcuts would see: UIRoot's Tab (DM screen) and Enter (dice log), by the same rules. */
function listenLikeTheMap(store: ViewAtlasStore): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!canRunMapHotkeys(event, 'view-1')) return;
    if (matchesMapHotkey(event, 'dashboard')) store.getState().setDMScreenOpen(!store.getState().isDMScreenOpen);
    if (matchesMapHotkey(event, 'diceLog')) store.getState().setDiceLogOpen(!store.getState().isDiceLogOpen);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

setUpToolbarTestDom();

describe('entering the toolbar editor', () => {
  it('is offered in the GM\'s palette and starts edit mode, closing the palette', () => {
    const harness = renderToolbar();
    act(() => harness.store.getState().setCommandPaletteOpen(true));
    fireEvent.click(screen.getByRole('button', { name: /^Customize toolbar/ }));
    expect(harness.store.getState()).toMatchObject({ isToolbarEditing: true, isCommandPaletteOpen: false });
    expect(harness.container.querySelector('.atlas-toolbar-tray')).not.toBeNull();
    expect(liveRegion(harness.container)).toContain('Editing the toolbar.');
  });

  it('is not offered in the player view', () => {
    const harness = renderToolbar({ player: true });
    act(() => harness.store.getState().setCommandPaletteOpen(true));
    expect(screen.getByPlaceholderText('Search commands...')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Customize toolbar/ })).toBeNull();
    expect(harness.container.querySelector('[role="status"]')).toBeNull();
  });

  it('moves focus onto the bar only when the palette action was chosen with the keyboard', () => {
    const harness = renderToolbar();
    act(() => harness.store.getState().setCommandPaletteOpen(true));
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'Customize toolbar' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(harness.store.getState().isToolbarEditing).toBe(true);
    expect(document.activeElement).toBe(handle(harness.container, 'move'));
  });

  it('makes the tools inert under handles named after the catalog', () => {
    const harness = renderToolbar();
    startEditing(harness);
    const fog = harness.container.querySelector('[data-toolbar-item="fog"]')!;
    expect(fog.querySelector('.atlas-toolbar-item__content')?.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('button', { name: 'Fog of war' })).toBe(handle(harness.container, 'fog'));
    expect(harness.container.querySelector('.atlas-main-toolbar')?.getAttribute('role')).toBe('toolbar');
    // One Tab stop for the bar's handles.
    expect(handle(harness.container, 'move').tabIndex).toBe(0);
    expect(handle(harness.container, 'fog').tabIndex).toBe(-1);
  });

  it('closes the dice tray', () => {
    const harness = renderToolbar();
    act(() => harness.store.getState().setDiceTrayOpen(true));
    startEditing(harness);
    expect(harness.store.getState().isDiceTrayOpen).toBe(false);
  });
});

describe('the tray', () => {
  it('holds the hidden tools in their remembered order, then Reset and Done', () => {
    const harness = renderToolbar({ stored: { order: ['loot', 'move', 'fog'], hidden: ['fog', 'loot'] } });
    startEditing(harness);
    expect(trayIds(harness.container)).toEqual(['loot', 'fog']);
    const tray = harness.container.querySelector<HTMLElement>('.atlas-toolbar-tray')!;
    expect(within(tray).getByRole('button', { name: 'Reset toolbar' })).toBeTruthy();
    expect(within(tray).getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(within(tray).queryByText('Drag a tool here to hide it')).toBeNull();
  });

  it('shows a hint while no tool is hidden, and Reset disabled on the default layout', () => {
    const harness = renderToolbar();
    startEditing(harness);
    const tray = harness.container.querySelector<HTMLElement>('.atlas-toolbar-tray')!;
    expect(within(tray).getByText('Drag a tool here to hide it')).toBeTruthy();
    expect(within(tray).getByRole('button', { name: 'Reset toolbar' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('resets the layout and undoes the reset', () => {
    const harness = renderToolbar({ stored: { hidden: ['fog'] } });
    startEditing(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Reset toolbar' }));
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(trayIds(harness.container)).toEqual([]);
    expect(liveRegion(harness.container)).toBe('Toolbar reset.');

    fireEvent.click(screen.getByRole('button', { name: 'Undo reset' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['fog'] });
    expect(trayIds(harness.container)).toEqual(['fog']);
    expect(liveRegion(harness.container)).toBe('Reset undone.');
    expect(screen.getByRole('button', { name: 'Reset toolbar' })).toBeTruthy();
  });

  it('ends edit mode with Done and returns focus to the Command palette button', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(harness.store.getState().isToolbarEditing).toBe(false);
    expect(document.activeElement).toBe(paletteButton(harness.container));
    expect(liveRegion(harness.container)).toBe('Done editing the toolbar.');
    // The tray sinks away, taking no input meanwhile.
    expect(harness.container.querySelector('.atlas-toolbar-editor')?.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(harness.container.querySelector('.atlas-toolbar-tray')).toBeNull());
  });

  it('leaves Hidden tools out of the bar where the view does not offer them', () => {
    const harness = renderToolbar({ stored: { hidden: ['wall', 'fog'] } });
    startEditing(harness);
    expect(trayIds(harness.container)).toEqual(['fog']);
  });
});

describe('the editor menu', () => {
  it('offers Hide on a bar tool, disabled on the Command palette', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    fireEvent.contextMenu(handle(harness.container, 'palette'), { clientX: 10, clientY: 10 });
    const hide = await screen.findByRole('menuitem', { name: 'Hide' });
    expect(hide.getAttribute('aria-disabled')).toBe('true');
  });

  it('hides a tool with Hide and shows it again with Show on toolbar', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    fireEvent.contextMenu(handle(harness.container, 'fog'), { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['fog'] });
    expect(trayIds(harness.container)).toEqual(['fog']);
    expect(harness.container.querySelector('[data-toolbar-item="fog"]')?.hasAttribute('hidden')).toBe(true);
    expect(liveRegion(harness.container)).toBe('Fog of war hidden. F still selects it.');

    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Hide' })).toBeNull());
    fireEvent.contextMenu(handle(harness.container, 'fog', 'tray'), { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show on toolbar' }));
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(liveRegion(harness.container)).toBe('Fog of war is back on the toolbar, position 2 of 10.');
  });

  it('opens Hide from a row of "More tools" instead of running the control', async () => {
    const harness = renderToolbar({ space: 200 });
    startEditing(harness);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    const overflow = screen.getByRole('menu', { name: 'More tools' });
    fireEvent.click(within(overflow).getByRole('menuitem', { name: /^Asset Manager/ }));
    expect(harness.store.getState().isAssetManagerOpen).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['assets'] });
    expect(harness.store.getState().isToolbarEditing).toBe(true);
  });
});

describe('the keyboard path', () => {
  it('moves a bar tool with Alt and the arrow keys, and keeps focus on it', () => {
    const harness = renderToolbar();
    startEditing(harness);
    const fog = handle(harness.container, 'fog');
    act(() => fog.focus());
    expect(fireEvent.keyDown(fog, { key: 'ArrowRight', altKey: true })).toBe(false);
    expect(harness.settings.getToolbarLayout().order?.slice(0, 4)).toEqual(['move', 'draw', 'fog', 'text']);
    expect(document.activeElement).toBe(handle(harness.container, 'fog'));
    expect(liveRegion(harness.container)).toBe('Fog of war moved from position 2 to 3.');
  });

  it('moves focus with the arrow keys and hides with Delete, focus going to the next tool', () => {
    const harness = renderToolbar();
    startEditing(harness);
    const move = handle(harness.container, 'move');
    act(() => move.focus());
    fireEvent.keyDown(move, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(handle(harness.container, 'fog'));
    expect(handle(harness.container, 'fog').tabIndex).toBe(0);

    expect(fireEvent.keyDown(handle(harness.container, 'fog'), { key: 'Delete' })).toBe(false);
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['fog'] });
    expect(document.activeElement).toBe(handle(harness.container, 'draw'));
  });

  it('refuses to hide the Command palette', () => {
    const harness = renderToolbar();
    startEditing(harness);
    fireEvent.keyDown(handle(harness.container, 'palette'), { key: 'Delete' });
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(liveRegion(harness.container)).toBe('The command palette always stays on the toolbar.');
  });

  it('shows a tray tool with Enter and jumps between bar and tray with Up and Down', () => {
    const harness = renderToolbar({ stored: { hidden: ['fog'] } });
    startEditing(harness);
    const move = handle(harness.container, 'move');
    act(() => move.focus());
    fireEvent.keyDown(move, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(handle(harness.container, 'fog', 'tray'));
    fireEvent.keyDown(handle(harness.container, 'fog', 'tray'), { key: 'Enter' });
    expect(harness.settings.getToolbarLayout()).toEqual({});
    // The tray is empty now, so focus follows the tool onto the bar.
    expect(document.activeElement).toBe(handle(harness.container, 'fog'));
  });

  it('opens the menu with Shift+F10, whose Hide hands focus to the next tool', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    const fog = handle(harness.container, 'fog');
    act(() => fog.focus());
    expect(fireEvent.keyDown(fog, { key: 'F10', shiftKey: true })).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['fog'] });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Hide' })).toBeNull());
    expect(document.activeElement).toBe(handle(harness.container, 'draw'));
  });

  it('keeps Tab from the map\'s shortcuts, so focus moves on from the bar to "More tools"', () => {
    const harness = renderToolbar({ space: 200 });
    const stop = listenLikeTheMap(harness.store);
    try {
      startEditing(harness);
      const handles = Array.from(harness.container.querySelectorAll<HTMLElement>('.atlas-main-toolbar > .atlas-toolbar-item:not([hidden]) > .atlas-toolbar-handle'));
      const last = handles[handles.length - 1]!;
      act(() => last.focus());
      expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(true);
      expect(harness.store.getState().isDMScreenOpen).toBe(false);
      const tabbable = Array.from(harness.container.querySelectorAll<HTMLElement>('button'))
        .filter(button => button.tabIndex >= 0 && !button.closest('[inert], [hidden]'));
      expect(tabbable[tabbable.indexOf(last) + 1]?.closest('.atlas-toolbar-overflow')).not.toBeNull();
    } finally {
      stop();
    }
  });

  it('keeps Enter on Done from the map\'s shortcuts', () => {
    const harness = renderToolbar();
    const stop = listenLikeTheMap(harness.store);
    try {
      startEditing(harness);
      const done = screen.getByRole('button', { name: 'Done' });
      expect(fireEvent.keyDown(done, { key: 'Enter' })).toBe(true);
      fireEvent.click(done);
      expect(harness.store.getState()).toMatchObject({ isToolbarEditing: false, isDiceLogOpen: false });
    } finally {
      stop();
    }
  });
});

describe('leaving edit mode', () => {
  it('ends on Escape that no control used, focus returning from a handle to the palette button', () => {
    const harness = renderToolbar();
    startEditing(harness);
    const fog = handle(harness.container, 'fog');
    act(() => fog.focus());
    expect(fireEvent.keyDown(fog, { key: 'Escape' })).toBe(false);
    expect(harness.store.getState().isToolbarEditing).toBe(false);
    expect(document.activeElement).toBe(paletteButton(harness.container));
  });

  it('stays on while Escape closes the editor menu', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    fireEvent.contextMenu(handle(harness.container, 'fog'), { clientX: 10, clientY: 10 });
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Hide' }), { key: 'Escape' });
    expect(harness.store.getState().isToolbarEditing).toBe(true);
  });

  it('stays on while Escape closes "More tools"', () => {
    const harness = renderToolbar({ space: 200 });
    startEditing(harness);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    expect(fireEvent.keyDown(screen.getByRole('menu', { name: 'More tools' }), { key: 'Escape' })).toBe(false);
    expect(screen.queryByRole('menu', { name: 'More tools' })).toBeNull();
    expect(harness.store.getState().isToolbarEditing).toBe(true);
  });

  it('ends when the scene unloads or another tab comes to the front', () => {
    const harness = renderToolbar();
    startEditing(harness);
    act(() => { harness.bus.emit('map-unloading'); });
    expect(harness.store.getState().isToolbarEditing).toBe(false);

    startEditing(harness);
    const leafChange = harness.workspaceOn.mock.calls.filter(([event]) => event === 'active-leaf-change').at(-1)?.[1] as (leaf: unknown) => void;
    act(() => leafChange({}));
    expect(harness.store.getState().isToolbarEditing).toBe(false);
  });

  it('ends when the palette opens', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    act(() => harness.store.getState().setCommandPaletteOpen(true));
    expect(harness.store.getState().isToolbarEditing).toBe(false);
    await waitFor(() => expect(harness.container.querySelector('.atlas-toolbar-tray')).toBeNull());
  });
});
