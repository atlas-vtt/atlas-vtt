import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { EventEmitter } from 'events';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

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
/** The view's dice tool and the vault's settings, which the badge reads. */
let diceTool: DiceTool;
let settings: SettingsService;
let vaultApp: ReturnType<typeof createInMemoryApp>['app'];

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
    app: vaultApp,
    view: {
      getViewType: () => 'atlas-vtt',
      serviceManager: {
        getEventBus: () => null,
        getToolController: () => ({ getDiceTool: () => diceTool }),
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
  useAtlasSettings: () => undefined,
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
  ToolButton: ({ label, status, onClick, disabled }: { label: string; status?: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}{status ? `, ${status}` : ''}
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

describe('MainToolbar secret roll badge', () => {
  beforeEach(() => {
    capturedShortcuts = {};
    ({ app: vaultApp } = createInMemoryApp({ files: {} }));
    settings = new SettingsService(vaultApp);
    diceTool = new DiceTool(new EventEmitter());
  });

  it('says on the Roll Dice button that the secret roll is on', () => {
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    act(() => diceTool.setSecretRoll(true));
    render(<MainToolbar viewId="view-1" />);
    expect(screen.getByRole('button', { name: 'Roll Dice, Secret roll on' })).not.toBeNull();
  });

  it('says nothing on the Roll Dice button while the secret roll is off', () => {
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    render(<MainToolbar viewId="view-1" />);
    expect(screen.getByRole('button', { name: 'Roll Dice' })).not.toBeNull();
  });

  it('says nothing on the Roll Dice button while Show dice rolls is off, however the switch stands', () => {
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    act(() => diceTool.setSecretRoll(true));
    render(<MainToolbar viewId="view-1" />);
    expect(screen.getByRole('button', { name: 'Roll Dice' })).not.toBeNull();
  });
});
