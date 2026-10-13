import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getHistoryStore } from '../../src/app/stores/history';
import { handle, renderToolbar, setUpToolbarTestDom, startEditing, type ToolbarHarness } from './toolbarEditorHarness';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
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

const trayIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-tray-item]:not([hidden])')).map(item => item.dataset.trayItem ?? '');

const liveRegion = (container: HTMLElement): string => container.querySelector('[role="status"]')?.textContent ?? '';

const undoSlot = (container: HTMLElement): HTMLElement => {
  const slot = container.querySelector<HTMLElement>('.atlas-bottom-toolbar-row__start > .atlas-undo-bar');
  if (!slot) throw new Error('No undo/redo bar');
  return slot;
};

/** A change the history records, so undo has something to take back. */
function recordChange({ store }: ToolbarHarness): void {
  act(() => store.setState({ background: 'maps/cave.png' }));
}

setUpToolbarTestDom();

describe('the undo/redo bar in the toolbar editor', () => {
  it('is inert under a handle named after the catalog while editing, and never a control of the main bar', () => {
    const harness = renderToolbar({ undoBar: true });
    expect(undoSlot(harness.container).querySelector('.atlas-toolbar-handle')).toBeNull();
    startEditing(harness);
    const bar = undoSlot(harness.container).querySelector('.atlas-undo-redo-controls');
    expect(bar?.hasAttribute('inert')).toBe(true);
    expect(bar?.classList.contains('is-editing')).toBe(true);
    expect(screen.getByRole('button', { name: 'Undo and redo' })).toBe(handle(harness.container, 'undo'));
    expect(harness.container.querySelector('.atlas-main-toolbar [data-toolbar-item="undo"]')).toBeNull();
    // The tray keeps a slot for it, closed while the bar shows.
    expect(trayIds(harness.container)).toEqual([]);
  });

  it('hides with Hide from its menu, stays mounted, and shows first in the tray', async () => {
    const harness = renderToolbar({ undoBar: true, stored: { hidden: ['fog'] } });
    startEditing(harness);
    fireEvent.contextMenu(handle(harness.container, 'undo'), { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['undo', 'fog'] });
    expect(undoSlot(harness.container).hidden).toBe(true);
    expect(trayIds(harness.container)).toEqual(['undo', 'fog']);
    expect(liveRegion(harness.container)).toBe('Undo and redo hidden. Ctrl/Cmd + Z still undoes.');
  });

  it('hides with Delete on its handle, focus going to the bar\'s first tool', () => {
    const harness = renderToolbar({ undoBar: true });
    startEditing(harness);
    const undo = handle(harness.container, 'undo');
    act(() => undo.focus());
    expect(fireEvent.keyDown(undo, { key: 'Delete' })).toBe(false);
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['undo'] });
    expect(document.activeElement).toBe(handle(harness.container, 'move'));
  });

  it('shows again with Enter on its tray face, at its own place', () => {
    const harness = renderToolbar({ undoBar: true, stored: { hidden: ['undo'] } });
    startEditing(harness);
    expect(undoSlot(harness.container).hidden).toBe(true);
    const face = handle(harness.container, 'undo', 'tray');
    act(() => face.focus());
    expect(fireEvent.keyDown(face, { key: 'Enter' })).toBe(false);
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(undoSlot(harness.container).hidden).toBe(false);
    expect(liveRegion(harness.container)).toBe('Undo and redo is back, left of the toolbar.');
    // The tray emptied, so focus goes to the bar's handle for it.
    expect(document.activeElement).toBe(handle(harness.container, 'undo'));
  });

  it('shows again with Show on toolbar from its tray face', async () => {
    const harness = renderToolbar({ undoBar: true, stored: { hidden: ['undo'] } });
    startEditing(harness);
    fireEvent.contextMenu(handle(harness.container, 'undo', 'tray'), { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show on toolbar' }));
    expect(harness.settings.getToolbarLayout()).toEqual({});
  });

  it('comes back with Reset', () => {
    const harness = renderToolbar({ undoBar: true, stored: { hidden: ['undo'] } });
    startEditing(harness);
    const tray = harness.container.querySelector<HTMLElement>('.atlas-toolbar-tray')!;
    fireEvent.click(within(tray).getByRole('button', { name: 'Reset toolbar' }));
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(undoSlot(harness.container).hidden).toBe(false);
  });

  it('is first of the bar\'s handles for the arrow keys, and keeps its place with Alt and the arrows', () => {
    const harness = renderToolbar({ undoBar: true });
    startEditing(harness);
    const move = handle(harness.container, 'move');
    act(() => move.focus());
    fireEvent.keyDown(move, { key: 'ArrowLeft' });
    const undo = handle(harness.container, 'undo');
    expect(document.activeElement).toBe(undo);
    // Once focused last, it holds the bar group's one Tab stop.
    expect(undo.tabIndex).toBe(0);
    expect(handle(harness.container, 'move').tabIndex).toBe(-1);
    expect(fireEvent.keyDown(undo, { key: 'ArrowRight', altKey: true })).toBe(false);
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(liveRegion(harness.container)).toBe('Undo and redo always stays left of the toolbar.');
  });

  it('keeps the undo and redo hotkeys while it is hidden', () => {
    const harness = renderToolbar({ undoBar: true, stored: { hidden: ['undo'] } });
    const history = getHistoryStore(harness.store);
    recordChange(harness);
    expect(history.getState().pastStates).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(history.getState().pastStates).toHaveLength(0);
    expect(harness.store.getState().background).not.toBe('maps/cave.png');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(harness.store.getState().background).toBe('maps/cave.png');
  });

  it('ignores its clicks while editing, as the tools do', () => {
    const harness = renderToolbar({ undoBar: true });
    recordChange(harness);
    startEditing(harness);
    fireEvent.click(handle(harness.container, 'undo'));
    expect(getHistoryStore(harness.store).getState().pastStates).toHaveLength(1);
    expect(harness.settings.getToolbarLayout()).toEqual({});
  });

  it('leaves the player view as it was: no undo/redo bar, and a bar that ignores the stored layout', async () => {
    const harness = renderToolbar({ undoBar: true, player: true, stored: { hidden: ['undo', 'move'] } });
    expect(harness.container.querySelector('.atlas-undo-bar')).toBeNull();
    expect(harness.container.querySelector('[data-toolbar-item="move"]')?.hasAttribute('hidden')).toBe(false);
    act(() => harness.store.getState().setToolbarEditing(true));
    await waitFor(() => expect(harness.container.querySelector('.atlas-toolbar-tray')).toBeNull());
  });
});
