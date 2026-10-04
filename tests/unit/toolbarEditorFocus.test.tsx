import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { canRunMapHotkeys, matchesMapHotkey } from '../../src/app/keyboard/mapHotkeys';
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

const trayIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-tray-item]:not([hidden])')).map(item => item.dataset.trayItem ?? '');

const moreTools = (): HTMLElement => screen.getByRole('button', { name: 'More tools' });

/** The map's Delete as the orchestrator hears it: on the document, by the same rules. */
function listenForMapDelete(): { deletes: () => number; stop: () => void } {
  let count = 0;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!canRunMapHotkeys(event, 'view-1')) return;
    if (matchesMapHotkey(event, 'delete') || matchesMapHotkey(event, 'deleteAlt')) count += 1;
  };
  document.addEventListener('keydown', onKeyDown);
  return { deletes: () => count, stop: () => document.removeEventListener('keydown', onKeyDown) };
}

// jsdom has no PointerEvent: a mouse event of the pointer's type, with its id.
function pointer(type: string, x: number, y: number): PointerEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
  return event as PointerEvent;
}

setUpToolbarTestDom();

describe('focus around the editor menu', () => {
  it('returns to the handle when Escape closes a menu that Shift+F10 opened', async () => {
    const harness = renderToolbar();
    startEditing(harness);
    const fog = handle(harness.container, 'fog');
    act(() => fog.focus());
    fireEvent.keyDown(fog, { key: 'F10', shiftKey: true });
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Hide' }), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(handle(harness.container, 'fog')));
    expect(harness.store.getState().isToolbarEditing).toBe(true);
  });

  it('goes to "More tools" after Hide from one of its rows, and back to it on Escape', async () => {
    const harness = renderToolbar({ space: 200 });
    startEditing(harness);
    fireEvent.click(moreTools());
    fireEvent.click(within(screen.getByRole('menu', { name: 'More tools' })).getByRole('menuitem', { name: /^Asset Manager/ }));
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Hide' }), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(moreTools()));

    fireEvent.click(moreTools());
    fireEvent.click(within(screen.getByRole('menu', { name: 'More tools' })).getByRole('menuitem', { name: /^Asset Manager/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['assets'] });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Hide' })).toBeNull());
    expect(document.activeElement).toBe(moreTools());
  });
});

describe('Delete and Backspace while editing', () => {
  it('never reach the map\'s Delete from a tray tool, Reset or Done', () => {
    const harness = renderToolbar({ stored: { hidden: ['fog'] } });
    const map = listenForMapDelete();
    try {
      startEditing(harness);
      const tray = handle(harness.container, 'fog', 'tray');
      act(() => tray.focus());
      expect(fireEvent.keyDown(tray, { key: 'Delete' })).toBe(false);
      expect(fireEvent.keyDown(tray, { key: 'Backspace' })).toBe(false);
      fireEvent.keyDown(screen.getByRole('button', { name: 'Reset toolbar' }), { key: 'Delete' });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Done' }), { key: 'Backspace' });
      expect(map.deletes()).toBe(0);
      expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['fog'] });
    } finally {
      map.stop();
    }
  });

  it('do nothing on a handle while a tool is dragged, and never reach the map', () => {
    const harness = renderToolbar();
    const map = listenForMapDelete();
    try {
      startEditing(harness);
      const fog = handle(harness.container, 'fog');
      act(() => {
        fog.dispatchEvent(pointer('pointerdown', 10, 10));
        window.dispatchEvent(pointer('pointermove', 30, 10));
      });
      expect(harness.container.querySelector('[data-toolbar-item="fog"]')?.hasAttribute('data-lifted')).toBe(true);
      expect(fireEvent.keyDown(fog, { key: 'Delete' })).toBe(false);
      expect(fireEvent.keyDown(fog, { key: 'ArrowUp' })).toBe(false);
      expect(map.deletes()).toBe(0);
      expect(harness.settings.getToolbarLayout()).toEqual({});
      act(() => { window.dispatchEvent(pointer('pointercancel', 30, 10)); });
    } finally {
      map.stop();
    }
  });
});

describe('note previews during a drag', () => {
  it('stay suspended when the asset manager opens mid-drag and ends edit mode', () => {
    const notePreviews = { suspendPreviews: vi.fn(), resumePreviews: vi.fn() };
    const harness = renderToolbar({ notePreviews });
    startEditing(harness);
    act(() => {
      handle(harness.container, 'fog').dispatchEvent(pointer('pointerdown', 10, 10));
      window.dispatchEvent(pointer('pointermove', 30, 10));
    });
    expect(notePreviews.suspendPreviews).toHaveBeenCalledTimes(1);
    // What the asset manager's hotkey does: open it (which ends edit mode), then suspend the previews.
    act(() => {
      harness.store.getState().openAssetManager();
      notePreviews.suspendPreviews();
    });
    expect(harness.store.getState().isToolbarEditing).toBe(false);
    expect(notePreviews.resumePreviews).not.toHaveBeenCalled();
  });
});

describe('Lighting in the editor', () => {
  it('is in the tray while hidden with dynamic lighting on, and leaves it when the switch goes off', () => {
    const harness = renderToolbar({ stored: { hidden: ['wall'] } });
    act(() => harness.settings.setExperimental('dynamicLighting', true));
    startEditing(harness);
    expect(trayIds(harness.container)).toEqual(['wall']);

    act(() => harness.settings.setExperimental('dynamicLighting', false));
    expect(trayIds(harness.container)).toEqual([]);
    expect(harness.container.querySelector('.atlas-main-toolbar [data-toolbar-item="wall"]')).toBeNull();
    expect(harness.store.getState().isToolbarEditing).toBe(true);
  });
});
