// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Stands in for a map surface the cheat sheet has nothing to do with. */
function surface(name: string) {
  return (): React.ReactElement => <i data-surface={name} />;
}

vi.mock('../../src/app/packages/components/MainToolbar', () => ({ MainToolbar: surface('toolbar') }));
vi.mock('../../src/app/react/components/SceneTabBar', () => ({ SceneTabBar: surface('scene-tabs') }));
vi.mock('../../src/app/react/components/ResponsiveWidgetBar', () => ({ ResponsiveWidgetBar: surface('widgets') }));
vi.mock('../../src/app/react/components/dice/DiceRollDisplay', () => ({ DiceRollDisplay: surface('dice') }));
vi.mock('../../src/app/react/components/ViewActionsMenu', () => ({ ViewActionsMenu: surface('view-actions') }));
vi.mock('../../src/app/react/components/UndoRedoControls', () => ({ UndoRedoControls: surface('undo-redo') }));
vi.mock('../../src/app/react/components/InitiativeTracker', () => ({ InitiativeTracker: surface('initiative') }));
vi.mock('../../src/app/react/components/dice-log/DiceRollLog', () => ({ DiceRollLog: surface('dice-log') }));
vi.mock('../../src/app/react/components/randomTables/RandomTablesPanel', () => ({ RandomTables: surface('loot') }));
vi.mock('../../src/app/react/components/scene-switcher/SceneSwitcher', () => ({ SceneSwitcher: surface('scene-switcher') }));
vi.mock('../../src/app/pixi/lighting/LightPopover', () => ({ LightPopoverHost: surface('light-popover') }));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTab: vi.fn(), presentActiveTab: vi.fn(), openPlayerWindow: vi.fn() }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isShortcutScopeActive: () => true }));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ addTokenHighlight: vi.fn() }));
vi.mock('../../src/app/pixi/tokenFocus', () => ({ focusToken: vi.fn() }));

import { UIRoot } from '../../src/app/react/UIRoot';
import { CommandPalette } from '../../src/app/react/components/CommandPalette';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { AtlasView } from '../../src/app/atlas-view';

function mapStore(id: string): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, id);
  store.getState().setPersistenceEnabled(false);
  store.setState({ background: 'maps/cave.png', isMapLoading: false });
  return store;
}

function renderMap(store: ViewAtlasStore, viewType = 'atlas-vtt'): void {
  const { app } = createInMemoryApp();
  const view = { viewId: `hotkey-help-${viewType}`, renderer: null, getViewType: () => viewType } as unknown as AtlasView;
  render(<ViewStoreProvider store={store}><UIRoot app={app} view={view} pixiApp={null} /></ViewStoreProvider>);
}

const sheet = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Cheat sheet' });

// jsdom never finishes a transform animation, so a closing sheet would stay mounted there; a browser test closes it for real.
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('the keyboard shortcuts cheat sheet', () => {
  it('opens from the button at the map\'s bottom right and closes again', async () => {
    const store = mapStore('hotkey-help-button');
    renderMap(store);
    expect(sheet()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cheat sheet' }));
    expect(store.getState().isHotkeyHelpOpen).toBe(true);
    expect(sheet()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close cheat sheet' }));
    expect(store.getState().isHotkeyHelpOpen).toBe(false);
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it('has no button in the player view, which players see on the table', () => {
    renderMap(mapStore('hotkey-help-player'), 'atlas-vtt-player');
    expect(screen.queryByRole('button', { name: 'Cheat sheet' })).toBeNull();
  });

  it('opens from the command palette, which closes', () => {
    const { app } = createInMemoryApp();
    const store = mapStore('hotkey-help-palette');
    const onClose = vi.fn();
    const ui = { app, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
    render(
      <AtlasUIContext.Provider value={ui}>
        <ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Search commands…'), { target: { value: 'cheat sheet' } });
    fireEvent.click(screen.getByText('Cheat sheet'));

    expect(store.getState().isHotkeyHelpOpen).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens from the palette by Enter, which no button of the sheet then receives', () => {
    const { app } = createInMemoryApp();
    const store = mapStore('hotkey-help-palette-enter');
    const ui = { app, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
    render(
      <AtlasUIContext.Provider value={ui}>
        <ViewStoreProvider store={store}><CommandPalette isOpen onClose={vi.fn()} /></ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );

    const input = screen.getByPlaceholderText('Search commands…');
    fireEvent.change(input, { target: { value: 'keyboard' } });
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' });

    expect(store.getState().isHotkeyHelpOpen).toBe(true);
    expect(notPrevented).toBe(false);
  });
});
