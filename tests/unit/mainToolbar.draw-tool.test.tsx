// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAW_TOOL } from '../../src/app/annotations/annotationTypes';
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
const setDrawTool = vi.fn();

let capturedShortcuts: Record<string, (event: KeyboardEvent) => void> = {};
/** The tokens the canvas shows; session view hides some of the store's. */
let visibleTokenIds: string[] = [];
/** Atlas' settings as the toolbar reads them; undefined where they cannot be reached. */
let settings: {
  getToolbarLayout: () => StoredToolbarLayout;
  getLaserPointerSettings: () => LaserPointerSettings;
  getLightingQuality: () => 'high';
  isLightingQualityPicked: () => boolean;
  setLightingQuality: () => void;
  getDragDistance: () => 'always';
  setDragDistance: () => void;
} | undefined;
let viewType = 'atlas-vtt';

function settingsWithLayout(layout: StoredToolbarLayout): typeof settings {
  return { getToolbarLayout: () => layout, getLaserPointerSettings: () => DEFAULT_LASER_POINTER_SETTINGS, getLightingQuality: () => 'high', isLightingQualityPicked: () => false, setLightingQuality: () => undefined, getDragDistance: () => 'always', setDragDistance: () => undefined };
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
  lightingTool: { mode: 'draw', drawMode: 'point-to-point', lightPreset: null },
  setLightingTool: vi.fn(),
  measureTool: { mode: 'ruler', keep: false, players: true, color: null, lineWidth: 1 },
  setMeasureTool: vi.fn(),
  drawTool: DEFAULT_DRAW_TOOL,
  setDrawTool,
  setSelection,
  openAssetManager,
  closeAssetManager,
};

const storeHook = {
  getState: () => storeState,
  subscribe: () => () => undefined,
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

describe('MainToolbar and the Draw tool', () => {
  beforeEach(() => {
    capturedShortcuts = {};
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
    setDrawTool.mockReset();
  });

  it('selects the Draw tool in its Text mode from the T shortcut, and in the mode it has from B', () => {
    render(<MainToolbar viewId="view-1" />);

    capturedShortcuts.text(new KeyboardEvent('keydown', { key: 't' }));
    expect(setDrawTool).toHaveBeenCalledWith({ mode: 'text' });
    expect(setActiveTool).toHaveBeenCalledWith('draw');

    setDrawTool.mockReset();
    setActiveTool.mockReset();
    capturedShortcuts.draw(new KeyboardEvent('keydown', { key: 'b' }));
    expect(setActiveTool).toHaveBeenCalledWith('draw');
    expect(setDrawTool).not.toHaveBeenCalled();
  });

  it('selects only the tokens the canvas shows with select all', () => {
    visibleTokenIds = ['hero'];
    render(<MainToolbar viewId="view-1" />);

    capturedShortcuts.selectAll(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));

    expect(setSelection).toHaveBeenCalledWith(['hero']);
  });

  it('selects every drawing and text, and no token, with select all in the Draw tool\'s Select mode', () => {
    visibleTokenIds = ['hero'];
    const before = { activeTool: storeState.activeTool, drawTool: storeState.drawTool, objects: storeState.objects };
    Object.assign(storeState, {
      activeTool: 'draw',
      drawTool: { ...DEFAULT_DRAW_TOOL, mode: 'select' },
      objects: {
        tokens: {},
        drawings: { mark: { id: 'mark', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], color: '#ffffff', width: 4, opacity: 1, layer: 'map' } },
        texts: { sign: { id: 'sign', kind: 'text', x: 0, y: 0, text: 'Gate', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', locked: true } },
      },
    });
    try {
      render(<MainToolbar viewId="view-1" />);
      capturedShortcuts.selectAll(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
      expect(setSelection).toHaveBeenCalledWith(['sign', 'mark']);
    } finally {
      Object.assign(storeState, before);
    }
  });

  it('renders one button for drawing and text, named by the mode in hand, which selects the tool', () => {
    render(<MainToolbar viewId="view-1" />);

    expect(screen.queryByRole('button', { name: 'Text Tool' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Pen' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(setActiveTool).toHaveBeenCalledWith('draw');
  });

  it('has the Lighting tool to the left of the note pin', () => {
    render(<MainToolbar viewId="view-1" />);
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels.indexOf('Lighting')).toBeGreaterThan(-1);
    expect(labels.indexOf('Note Pin Tool')).toBe(labels.indexOf('Lighting') + 1);
  });

  it('shows the default layout where Atlas\' settings cannot be reached', () => {
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).toEqual(['move', 'fog', 'draw', 'measure', 'wall', 'pin', 'dice', 'loot', 'assets', 'palette']);
  });

  it('arranges the GM\'s bar by the stored layout and keeps hidden controls mounted', () => {
    settings = settingsWithLayout({
      order: ['palette', 'dice', 'move', 'fog', 'draw', 'text', 'measure', 'wall', 'pin', 'audio', 'loot', 'assets'],
      hidden: ['fog'],
    });
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).toEqual(['palette', 'dice', 'move', 'draw', 'measure', 'wall', 'pin', 'loot', 'assets']);
    expect(container.querySelector('[data-toolbar-item="fog"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows Draw where an older layout hid it and kept Text, and hides it where both were hidden', () => {
    settings = settingsWithLayout({ hidden: ['draw'] });
    const kept = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(kept.container)).toContain('draw');
    kept.unmount();

    settings = settingsWithLayout({ hidden: ['draw', 'text'] });
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).not.toContain('draw');
    expect(container.querySelector('[data-toolbar-item="draw"]')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('[data-toolbar-item="text"]')).toBeNull();
  });

  it('ignores the stored layout in the player view', () => {
    viewType = 'atlas-vtt-player';
    settings = settingsWithLayout({ order: ['dice', 'measure', 'move'], hidden: ['move', 'measure', 'dice'] });
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(shownControls(container)).toEqual(['move', 'measure', 'dice']);
  });

  it('keeps a hidden Lighting tool mounted but hidden', () => {
    settings = settingsWithLayout({ hidden: ['wall'] });
    const { container } = render(<MainToolbar viewId="view-1" />);
    expect(container.querySelector('[data-toolbar-item="wall"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('accepts the Draw tool in the store', () => {
    const store = createViewAtlasStore({} as never, 'test-view');
    store.getState().setPersistenceEnabled(false);

    store.getState().setActiveTool('draw');

    expect(store.getState().activeTool).toBe('draw');
  });

  it('still refuses the ambient audio tool, which is withheld from this release', () => {
    const store = createViewAtlasStore({} as never, 'test-view');
    store.getState().setPersistenceEnabled(false);

    store.getState().setActiveTool('audio');

    expect(store.getState().activeTool).toBe('move');
  });
});
