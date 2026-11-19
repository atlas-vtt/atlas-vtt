// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { handle, renderToolbar, setUpToolbarTestDom, startEditing } from './toolbarEditorHarness';

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
vi.mock('../../src/app/react/components/command-palette/PlayerViewSettingsPanel', () => ({ PlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

const trayIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-tray-item]:not([hidden])')).map(item => item.dataset.trayItem ?? '');

const sideSlot = (container: HTMLElement, id: string): HTMLElement => {
  const slot = container.querySelector<HTMLElement>(`.atlas-side-bar[data-side-bar="${id}"]`);
  if (!slot) throw new Error(`No ${id} bar`);
  return slot;
};

const liveRegion = (container: HTMLElement): string => container.querySelector('[role="status"]')?.textContent ?? '';

setUpToolbarTestDom();

describe('the keyboard shortcuts button in the toolbar editor', () => {
  it('hides with Delete, keeps ? working, and comes back from the tray', () => {
    const harness = renderToolbar({ sideBars: { online: false } });
    startEditing(harness);
    const help = handle(harness.container, 'help');
    act(() => help.focus());
    fireEvent.keyDown(help, { key: 'Delete' });
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['help'] });
    expect(sideSlot(harness.container, 'help').hidden).toBe(true);
    expect(trayIds(harness.container)).toEqual(['help']);
    expect(liveRegion(harness.container)).toBe('Keyboard shortcuts hidden. ? still opens them.');

    fireEvent.keyDown(handle(harness.container, 'help', 'tray'), { key: 'Enter' });
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(sideSlot(harness.container, 'help').hidden).toBe(false);
  });

  it('is the last of the bar\'s handles for the arrow keys', () => {
    const harness = renderToolbar({ sideBars: { online: false } });
    startEditing(harness);
    const palette = handle(harness.container, 'palette');
    act(() => palette.focus());
    fireEvent.keyDown(palette, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(handle(harness.container, 'help'));
  });
});

describe('online play\'s button in the toolbar editor', () => {
  it('has no place and no tray slot while online play is off', () => {
    const harness = renderToolbar({ sideBars: { online: false }, stored: { hidden: ['online'] } });
    startEditing(harness);
    expect(harness.container.querySelector('.atlas-side-bar[data-side-bar="online"]')).toBeNull();
    expect(harness.container.querySelector('[data-tray-item="online"]')).toBeNull();
  });

  it('hides from its menu with the room the row kept for it, and shows again', async () => {
    const harness = renderToolbar({ sideBars: { online: true } });
    expect(harness.container.querySelector('.atlas-online-place')).not.toBeNull();
    expect(harness.container.querySelector('.atlas-bottom-toolbar-row__start > .atlas-online-room')).not.toBeNull();
    startEditing(harness);
    // First of the bar's handles, at the row's left edge.
    const move = handle(harness.container, 'move');
    act(() => move.focus());
    fireEvent.keyDown(move, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(handle(harness.container, 'online'));

    fireEvent.contextMenu(handle(harness.container, 'online'), { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }));
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['online'] });
    expect(sideSlot(harness.container, 'online').hidden).toBe(true);
    expect(harness.container.querySelector('.atlas-online-room')).toBeNull();
    expect(trayIds(harness.container)).toEqual(['online']);
    expect(liveRegion(harness.container)).toBe('Online play hidden.');

    fireEvent.keyDown(handle(harness.container, 'online', 'tray'), { key: 'Enter' });
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(sideSlot(harness.container, 'online').hidden).toBe(false);
  });
});
