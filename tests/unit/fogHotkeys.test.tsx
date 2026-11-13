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
  it('sizes the brush with the keys that size the Draw tool, which every keyboard types bare: , and .', () => {
    // [ and ] need Option or AltGr on a German keyboard, and then are no bare key.
    expect(DEFAULT_MAP_HOTKEYS.drawSmaller).toBe(',');
    expect(DEFAULT_MAP_HOTKEYS.drawLarger).toBe('.');
    expect(Object.values(DEFAULT_MAP_HOTKEYS)).not.toContain('[');
    expect(Object.values(DEFAULT_MAP_HOTKEYS)).not.toContain(']');
    // One pair of keys for both tools, named for both, among the GM's tool keys and not the players'.
    const gm = availableHotkeys().filter((action) => action.id === 'drawSmaller' || action.id === 'drawLarger');
    expect(gm.map((action) => action.label)).toEqual(['Smaller drawing or fog brush', 'Larger drawing or fog brush']);
    expect(availableHotkeys(true).map((action) => action.id)).not.toEqual(expect.arrayContaining(['drawSmaller']));
    for (const key of [',', '.']) expect(Object.values(DEFAULT_MAP_HOTKEYS).filter((bound) => bound === key)).toHaveLength(1);
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

  it('steps the brush with . and , while the fog tool hides or reveals, never as an undo step', () => {
    const store = mount();
    press('f');
    press('.');
    const larger = size(store);
    expect(larger).toBeGreaterThan(DEFAULT_FOG_TOOL.brushSize);
    press(',');
    press(',');
    expect(size(store)).toBeLessThan(DEFAULT_FOG_TOOL.brushSize);
    press('f');
    expect(store.getState().activeTool).toBe('eraser');
    const before = size(store);
    press('.');
    expect(size(store)).toBeGreaterThan(before);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    // The keys they had before do nothing now.
    const kept = size(store);
    press(']');
    press('[');
    expect(size(store)).toBe(kept);
  });

  it('stops at the smallest and the largest brush', () => {
    const store = mount();
    press('f');
    for (let i = 0; i < 40; i++) press('.');
    expect(size(store)).toBe(FOG_BRUSH_SIZES.max);
    for (let i = 0; i < 40; i++) press(',');
    expect(size(store)).toBe(FOG_BRUSH_SIZES.min);
  });

  it('leaves the brush as it is while another tool is in use, and in the players\' view', () => {
    const store = mount();
    press('.');
    press(',');
    press(',');
    expect(size(store)).toBe(DEFAULT_FOG_TOOL.brushSize);
    // While the Draw tool is in use the keys are that tool's.
    store.getState().setActiveTool('draw');
    press('.');
    expect(size(store)).toBe(DEFAULT_FOG_TOOL.brushSize);

    const players = mount(true);
    players.getState().setActiveTool('fog');
    press('.');
    expect(size(players)).toBe(DEFAULT_FOG_TOOL.brushSize);
  });

  it('takes its keys while it acts, so nothing else answers them', () => {
    const store = mount();
    press('f');
    // A key a shortcut took has its default prevented.
    expect(press('.')).toBe(false);
    expect(press(',')).toBe(false);
    expect(size(store)).toBe(DEFAULT_FOG_TOOL.brushSize);
  });
});
