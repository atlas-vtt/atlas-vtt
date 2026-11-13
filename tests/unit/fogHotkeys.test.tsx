// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FOG_TOOL, FOG_BRUSH_SIZES } from '../../src/app/fog/fogToolChoices';
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
  const store = createViewAtlasStore(app, `fog-keys-${Math.random()}`);
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

/** Whether the key was left alone: false once a shortcut took it. */
const press = (key: string): boolean => fireEvent.keyDown(window, { key });
const size = (store: ViewAtlasStore): number => store.getState().fogTool.brushSize;

describe('the fog tool\'s keys', () => {
  it('lists the brush\'s two keys among the GM\'s tool keys, on [ and ], and not among the players\'', () => {
    expect(DEFAULT_MAP_HOTKEYS.fogSmaller).toBe('[');
    expect(DEFAULT_MAP_HOTKEYS.fogLarger).toBe(']');
    const gm = availableHotkeys().map((action) => action.id);
    expect(gm).toContain('fogSmaller');
    expect(gm).toContain('fogLarger');
    const players = availableHotkeys(true).map((action) => action.id);
    expect(players).not.toContain('fogSmaller');
    expect(players).not.toContain('fogLarger');
    // No other action has the keys.
    for (const key of ['[', ']']) expect(Object.values(DEFAULT_MAP_HOTKEYS).filter((bound) => bound === key)).toHaveLength(1);
  });

  it('keeps F cycling between hiding and revealing', () => {
    const store = mount();
    press('f');
    expect(store.getState().activeTool).toBe('fog');
    press('f');
    expect(store.getState().activeTool).toBe('eraser');
    press('f');
    expect(store.getState().activeTool).toBe('fog');
  });

  it('steps the brush with ] and [ while the fog tool hides or reveals, never as an undo step', () => {
    const store = mount();
    press('f');
    press(']');
    const larger = size(store);
    expect(larger).toBeGreaterThan(DEFAULT_FOG_TOOL.brushSize);
    press('[');
    press('[');
    expect(size(store)).toBeLessThan(DEFAULT_FOG_TOOL.brushSize);
    press('f');
    expect(store.getState().activeTool).toBe('eraser');
    const before = size(store);
    press(']');
    expect(size(store)).toBeGreaterThan(before);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('stops at the smallest and the largest brush', () => {
    const store = mount();
    press('f');
    for (let i = 0; i < 40; i++) press(']');
    expect(size(store)).toBe(FOG_BRUSH_SIZES.max);
    for (let i = 0; i < 40; i++) press('[');
    expect(size(store)).toBe(FOG_BRUSH_SIZES.min);
  });

  it('leaves the brush as it is while another tool is in use, and in the players\' view', () => {
    const store = mount();
    press(']');
    press('[');
    press('[');
    expect(size(store)).toBe(DEFAULT_FOG_TOOL.brushSize);

    const players = mount(true);
    players.getState().setActiveTool('fog');
    press(']');
    expect(size(players)).toBe(DEFAULT_FOG_TOOL.brushSize);
  });

  it('takes its keys while it acts, so nothing else answers them', () => {
    const store = mount();
    press('f');
    // A key a shortcut took has its default prevented.
    expect(press(']')).toBe(false);
    expect(press('[')).toBe(false);
    expect(size(store)).toBe(DEFAULT_FOG_TOOL.brushSize);
  });
});
