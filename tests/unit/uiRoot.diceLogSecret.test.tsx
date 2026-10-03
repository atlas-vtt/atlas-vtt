import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** What UIRoot gave the dice log on each render. */
const diceLogProps = vi.hoisted(() => [] as Array<{ hideSecret?: boolean }>);

/** Stands in for a map surface: a named marker. */
function surface(name: string) {
  return (): React.ReactElement => <i data-surface={name} />;
}

vi.mock('../../src/app/react/BackgroundSprite', () => ({ BackgroundSprite: surface('background') }));
vi.mock('../../src/app/react/components/InitiativeTracker', () => ({ InitiativeTracker: surface('initiative') }));
vi.mock('../../src/app/packages/components/MainToolbar', () => ({ MainToolbar: surface('toolbar') }));
vi.mock('../../src/app/react/components/SceneTabBar', () => ({ SceneTabBar: surface('scene-tabs') }));
vi.mock('../../src/app/react/components/ResponsiveWidgetBar', () => ({ ResponsiveWidgetBar: surface('widgets') }));
vi.mock('../../src/app/react/components/dice/DiceRollDisplay', () => ({ DiceRollDisplay: surface('dice') }));
vi.mock('../../src/app/react/components/ViewActionsMenu', () => ({ ViewActionsMenu: surface('view-actions') }));
vi.mock('../../src/app/react/components/UndoRedoControls', () => ({ UndoRedoControls: surface('undo-redo') }));
vi.mock('../../src/app/react/components/DMDashboard', () => ({ default: surface('dm-dashboard') }));
vi.mock('../../src/app/react/components/dice-log/DiceRollLog', () => ({
  DiceRollLog: (props: { hideSecret?: boolean }): React.ReactElement => {
    diceLogProps.push(props);
    return <i data-surface="dice-log" />;
  },
}));
vi.mock('../../src/app/react/components/loot/LootRollerPanel', () => ({ LootRoller: surface('loot') }));
vi.mock('../../src/app/react/components/scene-switcher/SceneSwitcher', () => ({ SceneSwitcher: surface('scene-switcher') }));
vi.mock('../../src/app/react/components/GridSettingsModalSimple', () => ({ GridSettingsModal: surface('grid-settings') }));
vi.mock('../../src/app/react/components/GridAlignmentOverlay', () => ({ GridAlignmentOverlay: surface('grid-alignment') }));
vi.mock('../../src/app/pixi/lighting/LightPopover', () => ({ LightPopoverHost: surface('light-popover') }));
vi.mock('../../src/app/pixi/lighting/SceneLightingPanel', () => ({ SceneLightingPanelHost: surface('scene-lighting') }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ addTokenHighlight: vi.fn() }));
vi.mock('../../src/app/pixi/tokenFocus', () => ({ focusToken: vi.fn() }));

import { UIRoot } from '../../src/app/react/UIRoot';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { AtlasView } from '../../src/app/atlas-view';

function renderRoot(viewType: string): void {
  diceLogProps.length = 0;
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `ui-root-dice-log-${viewType}`);
  store.setState({ isMapLoading: false });
  const view = { viewId: `ui-root-dice-log-${viewType}`, renderer: null, getViewType: () => viewType } as unknown as AtlasView;
  render(<ViewStoreProvider store={store}><UIRoot app={app} view={view} pixiApp={null} /></ViewStoreProvider>);
}

describe('the dice log UIRoot mounts', () => {
  it('leaves secret rolls out in a player view', () => {
    renderRoot('atlas-vtt-player');
    expect(diceLogProps.at(-1)?.hideSecret).toBe(true);
  });

  it('keeps secret rolls in the GM view', () => {
    renderRoot('atlas-vtt');
    expect(diceLogProps.at(-1)?.hideSecret).toBe(false);
  });
});
