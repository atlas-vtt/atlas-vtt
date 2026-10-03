import React from 'react';
import { render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { StoredToolbarLayout } from '../../src/app/toolbar/toolbarLayout';
import { DEFAULT_LASER_POINTER_SETTINGS, type LaserPointerSettings } from '../../src/app/tools/laserPointerSettings';

const setActiveTool = vi.fn();
const setSelectionMode = vi.fn();
const setGMView = vi.fn();
const setCommandPaletteOpen = vi.fn();
const setDiceTrayOpen = vi.fn();
const setSelection = vi.fn();
const openAssetManager = vi.fn();
const closeAssetManager = vi.fn();
const setInitiativeTrackerOpen = vi.fn();

let capturedShortcuts: Record<string, (event: KeyboardEvent) => void> = {};
/** The tokens the canvas shows; session view hides some of the store's. */
let visibleTokenIds: string[] = [];
/** Whether the GM switched dynamic lighting on. */
let dynamicLighting = false;
/** Atlas' settings as the toolbar reads them; undefined where they cannot be reached. */
let settings: {
  isExperimentalOn: () => boolean;
  getToolbarLayout: () => StoredToolbarLayout;
  getLaserPointerSettings: () => LaserPointerSettings;
} | undefined;
let viewType = 'atlas-vtt';

function settingsWithLayout(layout: StoredToolbarLayout): typeof settings {
  return { isExperimentalOn: () => dynamicLighting, getToolbarLayout: () => layout, getLaserPointerSettings: () => DEFAULT_LASER_POINTER_SETTINGS };
}

const storeState = {
  activeTool: 'move',
  setActiveTool,
  selectionMode: 'box',
  setSelectionMode,
  isGMView: true,
  setGMView,
  isCommandPaletteOpen: false,
  setCommandPaletteOpen,
  isAssetManagerOpen: false,
  assetManagerInitialTab: 'assets',
  isDiceTrayOpen: false,
  setDiceTrayOpen,
  isToolbarEditing: false,
  setToolbarEditing: vi.fn(),
  initiativeTrackerOpen: false,
  lootRoller: { open: false },
  setLootRollerOpen: vi.fn(),
  setInitiativeTrackerOpen,
  objects: { tokens: {} },
  lighting: { enabled: false, ambient: 0.1 },
  setSceneLighting: vi.fn(),
  setSelection,
  openAssetManager,
  closeAssetManager,
};

const storeHook = {
  getState: () => storeState,
};

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  useViewStoreHook: () => storeHook,
}));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    view: {
      getViewType: () => viewType,
      serviceManager: {
        getEventBus: () => null,
        getToolController: () => null,
        getNotePreviewUIManager: () => null,
      },
      setFogBrushSize: vi.fn(),
      clearAllFog: vi.fn(),
    },
    mapData: null,
    renderer: { getTokenRenderer: () => ({ visibleTokenIds: () => visibleTokenIds }) },
  }),
}));

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => settings,
  useMapHotkeys: (shortcuts: Record<string, (event: KeyboardEvent) => void>) => {
    capturedShortcuts = shortcuts;
  },
}));

vi.mock('../../src/app/react/hooks/useExperimentalFeature', () => ({
  useExperimentalFeature: () => dynamicLighting,
}));

vi.mock('../../src/app/utils/activeLeafGuard', () => ({
  isActiveAtlasLeaf: () => true,
}));

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LabelTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/app/packages/components/primitives/ToolButton', () => ({
  ToolButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('../../src/app/packages/components/primitives/DropdownMenu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../src/app/packages/components/primitives/DropdownMenuItem', () => ({
  DropdownMenuItem: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('../../src/app/packages/components/primitives/DropdownToggleRow', () => ({
  DropdownToggleRow: () => null,
}));

vi.mock('../../src/app/packages/components/primitives/DropdownSliderRow', () => ({
  DropdownSliderRow: () => null,
}));

vi.mock('../../src/app/packages/components/primitives/DropdownModeSelector', () => ({
  DropdownModeSelector: () => null,
}));

vi.mock('../../src/app/packages/components/primitives/Toggle', () => ({
  Toggle: () => null,
}));

vi.mock('../../src/app/react/components/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({
  default: () => null,
}));

vi.mock('../../src/app/react/components/dice/DiceDropdownMenu', () => ({
  DiceDropdownMenu: () => null,
}));

import { MainToolbar } from '../../src/app/packages/components/MainToolbar';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

const shownControls = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-toolbar-item]:not([hidden])')).map((el) => el.dataset.toolbarItem ?? '');

describe('MainToolbar text tool', () => {
  beforeEach(() => {
    capturedShortcuts = {};
    dynamicLighting = false;
    settings = undefined;
    viewType = 'atlas-vtt';
    setActiveTool.mockReset();
    setSelectionMode.mockReset();
    setGMView.mockReset();
    setCommandPaletteOpen.mockReset();
    setDiceTrayOpen.mockReset();
    setSelection.mockReset();
    openAssetManager.mockReset();
    closeAssetManager.mockReset();
    setInitiativeTrackerOpen.mockReset();
  });

  it('activates the text tool from the T shortcut', () => {
    render(<MainToolbar viewId="view-1" />);

    capturedShortcuts.text(new KeyboardEvent('keydown', { key: 't' }));

    expect(setActiveTool).toHaveBeenCalledWith('text');
  });

  it('selects only the tokens the canvas shows with select all', () => {
    visibleTokenIds = ['hero'];
    render(<MainToolbar viewId="view-1" />);

    capturedShortcuts.selectAll(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));

    expect(setSelection).toHaveBeenCalledWith(['hero']);
  });

  it('renders the text tool button enabled', () => {
    render(<MainToolbar viewId="view-1" />);

    const button = screen.getByRole('button', { name: 'Text Tool' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('has the Lighting tool only while dynamic lighting is switched on, to the left of the note pin', () => {
    const { unmount } = render(<MainToolbar viewId="view-1" />);
    expect(screen.queryByRole('button', { name: 'Lighting' })).toBeNull();
    unmount();

    dynamicLighting = true;
    render(<MainToolbar viewId="view-1" />);
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels.indexOf('Lighting')).toBeGreaterThan(-1);
    expect(labels.indexOf('Note Pin Tool')).toBe(labels.indexOf('Lighting') + 1);
  });

  it('shows the default layout where Atlas\' settings cannot be reached', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).toEqual(['move', 'fog', 'draw', 'text', 'measure', 'pin', 'dice', 'loot', 'assets', 'palette']);
  });

  it('arranges the GM\'s bar by the stored layout and keeps hidden controls mounted', () => {
    settings = settingsWithLayout({
      order: ['palette', 'dice', 'move', 'fog', 'draw', 'text', 'measure', 'wall', 'pin', 'audio', 'loot', 'assets'],
      hidden: ['fog'],
    });
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).toEqual(['palette', 'dice', 'move', 'draw', 'text', 'measure', 'pin', 'loot', 'assets']);
    expect(container.querySelector('[data-toolbar-item="fog"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('ignores the stored layout in the player view', () => {
    viewType = 'atlas-vtt-player';
    settings = settingsWithLayout({ order: ['dice', 'measure', 'move'], hidden: ['move', 'measure', 'dice'] });
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).toEqual(['move', 'measure', 'dice']);
  });

  it('leaves a hidden Lighting tool out while dynamic lighting is off, and keeps it mounted but hidden while on', () => {
    settings = settingsWithLayout({ hidden: ['wall'] });
    const { container, unmount } = render(<MainToolbar viewId="view-1" />);
    expect(container.querySelector('[data-toolbar-item="wall"]')).toBeNull();
    unmount();

    dynamicLighting = true;
    const view = render(<MainToolbar viewId="view-1" />);
    expect(view.container.querySelector('[data-toolbar-item="wall"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('accepts the text tool in the store', () => {
    const store = createViewAtlasStore({} as never, 'test-view');
    store.getState().setPersistenceEnabled(false);

    store.getState().setActiveTool('text');

    expect(store.getState().activeTool).toBe('text');
  });

  it('still refuses the ambient audio tool, which is withheld from this release', () => {
    const store = createViewAtlasStore({} as never, 'test-view');
    store.getState().setPersistenceEnabled(false);

    store.getState().setActiveTool('audio');

    expect(store.getState().activeTool).toBe('move');
  });
});
