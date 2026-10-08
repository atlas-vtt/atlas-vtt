import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  activeTool: 'move',
  setActiveTool: vi.fn(),
  isPlayerView: false,
  isGMView: true,
  setGMView: vi.fn(),
  isCommandPaletteOpen: false,
  setCommandPaletteOpen: vi.fn(),
  isAssetManagerOpen: false,
  assetManagerInitialTab: 'assets',
  isDiceTrayOpen: false,
  setDiceTrayOpen: vi.fn(),
  lootRoller: { open: false },
  setLootRollerOpen: vi.fn(),
  objects: { tokens: {} },
  selectedIds: [],
  remoteView: null as object | null,
  isToolbarEditing: false,
  setToolbarEditing: vi.fn(),
};

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  useViewStoreHook: () => ({ getState: () => storeState }),
}));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    view: { viewId: 'view-1', getViewType: () => 'atlas-vtt', serviceManager: {} },
    mapData: null,
    renderer: null,
  }),
}));
vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => undefined,
  useMapHotkeys: () => undefined,
}));
vi.mock('../../src/app/react/hooks/useExperimentalFeature', () => ({ useExperimentalFeature: () => false }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
vi.mock('../../src/app/packages/components/toolbar/ToolbarOverflowMenu', () => ({ ToolbarOverflowMenu: () => null }));
vi.mock('../../src/app/react/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));
vi.mock('../../src/app/react/components/dice/DiceDropdownMenu', () => ({ DiceDropdownMenu: () => null }));
vi.mock('../../src/app/packages/components/toolbar/MoveToolGroup', () => ({ MoveToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/FogToolGroup', () => ({ FogToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/DrawToolGroup', () => ({ DrawToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/TextToolGroup', () => ({ TextToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/MeasureToolGroup', () => ({ MeasureToolGroup: () => null }));
vi.mock('../../src/app/packages/components/toolbar/LightingToolGroup', () => ({ LightingToolGroup: () => null }));
vi.mock('../../src/app/packages/components/primitives/Toggle', () => ({ Toggle: () => null }));
vi.mock('../../src/app/packages/components/toolbar/editor/ToolbarEditor', () => ({ ToolbarEditor: () => null }));
vi.mock('../../src/app/react/root/ContextMenuContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/react/root/ContextMenuContext')>()),
  useContextMenu: () => ({ openContextMenu: vi.fn(), closeContextMenu: vi.fn() }),
}));

import { MainToolbar } from '../../src/app/packages/components/MainToolbar';
import { toolbarSlot } from '../../src/app/extensions/slots';
import { registerRemoteControls } from '../../src/app/remote-view/remoteControls';
import type { ToolbarItem } from '../../src/api/types/ui';

const item = (overrides: Partial<ToolbarItem> = {}): ToolbarItem => ({
  id: 'x', icon: 'network', label: 'Quick notes', priority: 60, onClick: vi.fn(), ...overrides,
});

/** Registers `toolbarItem` inside act; the returned function removes it. */
function add(toolbarItem: ToolbarItem): () => void {
  let remove = (): void => undefined;
  act(() => { remove = toolbarSlot.add('ext', toolbarItem); });
  return () => act(() => { remove(); });
}

describe('MainToolbar with extension items', () => {
  beforeEach(() => {
    storeState.isPlayerView = false;
    storeState.remoteView = null;
    storeState.isToolbarEditing = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    expect(toolbarSlot.list()).toHaveLength(0);
  });

  const button = (): HTMLElement | null => screen.queryByRole('button', { name: 'Quick notes' });

  it('shows a registered item with its label and no title attribute, and removes it with its disposer', () => {
    render(<MainToolbar viewId="view-1" />);
    expect(button()).toBeNull();
    const remove = add(item());
    expect(button()).not.toBeNull();
    expect(button()?.hasAttribute('title')).toBe(false);
    remove();
    expect(button()).toBeNull();
  });

  it('calls onClick with the view context', () => {
    const onClick = vi.fn();
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ onClick }));
    fireEvent.click(button()!);
    expect(onClick).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false });
    remove();
  });

  it('shows a count badge, and drops it after invalidate once the badge returns null', () => {
    let badge: number | null = 3;
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ badge: () => badge }));
    expect(screen.getByText('3')).toBeTruthy();
    badge = null;
    act(() => { toolbarSlot.invalidate(); });
    expect(screen.queryByText('3')).toBeNull();
    remove();
  });

  it('shows a dot for a badge of true', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ badge: () => true }));
    expect(container.querySelector('.atlas-ext-tool__dot')).not.toBeNull();
    remove();
  });

  it('still renders the button, without a badge, when badge or isActive throws', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    const remove = add(item({
      badge: () => { throw new Error('boom'); },
      isActive: () => { throw new Error('boom'); },
    }));
    expect(button()).not.toBeNull();
    expect(container.querySelector('.atlas-ext-tool__badge, .atlas-ext-tool__dot')).toBeNull();
    remove();
  });

  it('logs a throwing badge or isActive once, not on every render', () => {
    const error = vi.mocked(console.error);
    error.mockClear();
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ badge: () => { throw new Error('boom'); }, isActive: () => { throw new Error('boom'); } }));
    act(() => { toolbarSlot.invalidate(); });
    act(() => { toolbarSlot.invalidate(); });
    const logged = error.mock.calls.filter(([message]) => typeof message === 'string' && message.includes('toolbar item'));
    expect(logged).toHaveLength(2);
    remove();
  });

  it('cuts a text badge longer than a button shows', () => {
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ badge: () => 'abcdefghijklmnop' }));
    expect(screen.getByText('abcdefg…')).toBeTruthy();
    remove();
  });

  it('keeps the rest of the toolbar when onClick throws', () => {
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ onClick: () => { throw new Error('boom'); } }));
    expect(() => fireEvent.click(button()!)).not.toThrow();
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeTruthy();
    remove();
  });

  it('leaves out an item that is for the remote view only', () => {
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ views: ['remote'] }));
    expect(button()).toBeNull();
    remove();
  });

  it('shows nothing of the extensions in a player view', () => {
    storeState.isPlayerView = true;
    render(<MainToolbar viewId="view-1" />);
    const remove = add(item());
    expect(button()).toBeNull();
    remove();
  });

  it('places an item after the dice and before the loot roller, with an id of its own', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    const remove = add(item({ id: 'dice' }));
    const ids = Array.from(container.querySelectorAll<HTMLElement>('[data-toolbar-item]')).map((el) => el.dataset.toolbarItem);
    expect(ids.indexOf('ext:ext:dice')).toBe(ids.indexOf('dice') + 1);
    expect(ids.indexOf('loot')).toBe(ids.indexOf('ext:ext:dice') + 1);
    remove();
  });

  it("leaves the extensions' items out while the toolbar editor arranges Atlas's controls", () => {
    const remove = add(item());
    storeState.isToolbarEditing = true;
    render(<MainToolbar viewId="view-1" />);
    expect(button()).toBeNull();
    expect(document.querySelector('[data-toolbar-item="dice"]')).not.toBeNull();
    remove();
  });

  it('shows the remote view its own items, told it is the remote view, and leaves out map items and GM tools there', () => {
    storeState.isPlayerView = true;
    storeState.remoteView = {};
    const onClick = vi.fn();
    render(<MainToolbar viewId="view-1" />);
    const removeRemote = add(item({ views: ['remote'], onClick }));
    const removeMap = add(item({ id: 'map-only', label: 'Map only' }));
    fireEvent.click(button()!);
    expect(onClick).toHaveBeenCalledWith({ viewId: 'view-1', kind: 'remote', isPlayerView: true });
    expect(screen.queryByRole('button', { name: 'Map only' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Loot Roller' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeTruthy();
    removeRemote();
    removeMap();
  });

  describe('isVisible', () => {
    /** Makes `view-1` a remote view opened by `owner`; the returned function closes it again. */
    function remoteOpenedBy(owner: string): () => void {
      storeState.isPlayerView = true;
      storeState.remoteView = {};
      return registerRemoteControls('view-1', { owner, fitMap: () => undefined, roll: () => null });
    }

    it('shows an item only while its predicate answers true, re-read on invalidate, and leaves no More tools entry', () => {
      let visible = false;
      const { container } = render(<MainToolbar viewId="view-1" />);
      const remove = add(item({ isVisible: () => visible }));
      expect(button()).toBeNull();
      expect(container.querySelector('[data-toolbar-item="ext:ext:x"]')).toBeNull();
      visible = true;
      act(() => { toolbarSlot.invalidate(); });
      expect(button()).not.toBeNull();
      visible = 'yes' as never;
      act(() => { toolbarSlot.invalidate(); });
      expect(button()).toBeNull();
      remove();
    });

    it('hides an item that is active as well', () => {
      render(<MainToolbar viewId="view-1" />);
      const remove = add(item({ isVisible: () => false, isActive: () => true }));
      expect(button()).toBeNull();
      remove();
    });

    it('tells the predicate whether the extension opened the remote view', () => {
      const isVisible = vi.fn(() => true);
      render(<MainToolbar viewId="view-1" />);
      const remove = add(item({ isVisible }));
      expect(isVisible).toHaveBeenLastCalledWith({ viewId: 'view-1', kind: 'map', isPlayerView: false, ownRemote: false });
      remove();
      cleanup();

      const closeOwn = remoteOpenedBy('ext');
      render(<MainToolbar viewId="view-1" />);
      const removeOwn = add(item({ views: ['remote'], isVisible: (ctx) => ctx.ownRemote }));
      expect(button()).not.toBeNull();
      removeOwn();
      closeOwn();
      cleanup();

      const closeOther = remoteOpenedBy('someone-else');
      render(<MainToolbar viewId="view-1" />);
      const removeOther = add(item({ views: ['remote'], isVisible: (ctx) => ctx.ownRemote }));
      expect(button()).toBeNull();
      removeOther();
      closeOther();
    });

    it('asks again once the remote view it is drawn in finds its owner, and when the owner lets it go', () => {
      storeState.isPlayerView = true;
      storeState.remoteView = {};
      render(<MainToolbar viewId="view-1" />);
      const remove = add(item({ views: ['remote'], isVisible: (ctx) => ctx.ownRemote }));
      expect(button()).toBeNull();
      let close = (): void => undefined;
      act(() => { close = registerRemoteControls('view-1', { owner: 'ext', fitMap: () => undefined, roll: () => null }); });
      expect(button()).not.toBeNull();
      act(() => { close(); });
      expect(button()).toBeNull();
      remove();
    });

    it('hides an item whose predicate throws, and logs the failure once', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(<MainToolbar viewId="view-1" />);
      const remove = add(item({ isVisible: () => { throw new Error('boom'); } }));
      act(() => { toolbarSlot.invalidate(); });
      act(() => { toolbarSlot.invalidate(); });
      expect(button()).toBeNull();
      expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeTruthy();
      expect(error.mock.calls.filter(([message]) => String(message).includes('isVisible'))).toHaveLength(1);
      remove();
    });
  });
});
