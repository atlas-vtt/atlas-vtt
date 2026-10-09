import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Stands in for a map surface: a named marker, so the test sees which surfaces are still there. */
function surface(name: string) {
  return (): React.ReactElement => <i data-surface={name} />;
}

vi.mock('../../src/app/react/components/InitiativeTracker', () => ({
  InitiativeTracker: (): never => { throw new TypeError("Cannot read properties of undefined (reading 'max')"); },
}));
vi.mock('../../src/app/packages/components/MainToolbar', () => ({ MainToolbar: surface('toolbar') }));
vi.mock('../../src/app/react/components/SceneTabBar', () => ({ SceneTabBar: surface('scene-tabs') }));
vi.mock('../../src/app/react/components/ResponsiveWidgetBar', () => ({ ResponsiveWidgetBar: surface('widgets') }));
vi.mock('../../src/app/react/components/dice/DiceRollDisplay', () => ({ DiceRollDisplay: surface('dice') }));
vi.mock('../../src/app/react/components/ViewActionsMenu', () => ({ ViewActionsMenu: surface('view-actions') }));
vi.mock('../../src/app/react/components/UndoRedoControls', () => ({ UndoRedoControls: surface('undo-redo') }));
vi.mock('../../src/app/react/components/DMDashboard', () => ({ default: surface('dm-dashboard') }));
vi.mock('../../src/app/react/components/dice-log/DiceRollLog', () => ({ DiceRollLog: surface('dice-log') }));
vi.mock('../../src/app/react/components/loot/LootRollerPanel', () => ({ LootRoller: surface('loot') }));
vi.mock('../../src/app/react/components/scene-switcher/SceneSwitcher', () => ({ SceneSwitcher: surface('scene-switcher') }));
vi.mock('../../src/app/react/components/GridSettingsModalSimple', () => ({ GridSettingsModal: surface('grid-settings') }));
vi.mock('../../src/app/react/components/GridAlignmentOverlay', () => ({ GridAlignmentOverlay: surface('grid-alignment') }));
vi.mock('../../src/app/pixi/lighting/LightPopover', () => ({ LightPopoverHost: surface('light-popover') }));
vi.mock('../../src/app/pixi/lighting/SceneLightingPanel', () => ({ SceneLightingPanelHost: surface('scene-lighting') }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTab: vi.fn() }));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ addTokenHighlight: vi.fn() }));
vi.mock('../../src/app/pixi/tokenFocus', () => ({ focusToken: vi.fn() }));

import { UIRoot } from '../../src/app/react/UIRoot';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { AtlasView } from '../../src/app/atlas-view';

afterEach(() => vi.restoreAllMocks());

describe('the map UI when one of its panels cannot render', () => {
  // The map image is drawn by the renderer, outside React, so no panel can take it down.
  it('keeps the scene tabs and the toolbar, and logs the panel once', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'ui-root-boundary-test');
    store.setState({ background: 'maps/cave.png', isMapLoading: false });
    const view = { viewId: 'ui-root-boundary-test', renderer: null, getViewType: () => 'atlas-vtt' } as unknown as AtlasView;

    const { container } = render(<ViewStoreProvider store={store}><UIRoot app={app} view={view} pixiApp={null} /></ViewStoreProvider>);

    const shown = Array.from(container.querySelectorAll('[data-surface]'), (element) => element.getAttribute('data-surface'));
    expect(shown).toEqual(expect.arrayContaining(['scene-tabs', 'widgets', 'dice', 'toolbar', 'undo-redo', 'view-actions', 'loot']));
    const panelErrors = logged.mock.calls.filter(([message]) => message === '[Atlas VTT] Could not show the initiative tracker:');
    expect(panelErrors).toHaveLength(1);
  });
});
