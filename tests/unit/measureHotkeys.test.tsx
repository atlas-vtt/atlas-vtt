// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_HOTKEYS, availableHotkeys } from '../../src/app/keyboard/mapHotkeys';
import { useToolbarHotkeys } from '../../src/app/packages/components/toolbar/useToolbarHotkeys';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(cleanup);

function Keys({ store, playerView }: { store: ViewAtlasStore; playerView: boolean }): React.ReactElement {
  useToolbarHotkeys('view', playerView, {
    selectTool: (tool) => store.getState().setActiveTool(tool),
    toggleAssetManager: () => undefined,
    closeAssetManager: () => undefined,
    toggleGMView: () => undefined,
    closeMenus: () => undefined,
  });
  return <div data-view-id="view" />;
}

function mount(playerView = false): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `measure-keys-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const ui = { app, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}>
        <div className="workspace-leaf mod-active"><Keys store={store} playerView={playerView} /></div>
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return store;
}

const press = (key: string): boolean => fireEvent.keyDown(window, { key });

describe('the measure tool\'s keys', () => {
  it('lists Keep among the GM\'s tool keys, on K, and not among the players\'', () => {
    expect(DEFAULT_MAP_HOTKEYS.measureKeep).toBe('k');
    expect(availableHotkeys().map((action) => action.id)).toContain('measureKeep');
    expect(availableHotkeys(true).map((action) => action.id)).not.toContain('measureKeep');
    // No other action has the key.
    expect(Object.values(DEFAULT_MAP_HOTKEYS).filter((key) => key === 'k')).toHaveLength(1);
  });

  it('selects the tool in the mode it was left in, and steps to the next mode when pressed again', () => {
    const store = mount();
    store.getState().setMeasureTool({ mode: 'circle' });
    expect(store.getState().activeTool).toBe('move');
    press('m');
    expect(store.getState().activeTool).toBe('measure');
    expect(store.getState().measureTool.mode).toBe('circle');
    press('m');
    expect(store.getState().measureTool.mode).toBe('cone');
    press('m');
    expect(store.getState().measureTool.mode).toBe('ruler');
    expect(store.getState().activeTool).toBe('measure');
  });

  it('switches Keep only while the measure tool is in use, and never as an undo step', () => {
    const store = mount();
    press('k');
    expect(store.getState().measureTool.keep).toBe(false);
    press('m');
    press('k');
    expect(store.getState().measureTool.keep).toBe(true);
    press('k');
    expect(store.getState().measureTool.keep).toBe(false);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('leaves Keep alone in the players\' view, which keeps nothing', () => {
    const store = mount(true);
    press('m');
    expect(store.getState().activeTool).toBe('measure');
    press('k');
    expect(store.getState().measureTool.keep).toBe(false);
  });
});
