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
  const store = createViewAtlasStore(app, `draw-keys-${Math.random()}`);
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
const tool = (store: ViewAtlasStore): string => store.getState().activeTool;
const mode = (store: ViewAtlasStore): string => store.getState().drawTool.mode;

describe('the Draw tool\'s keys', () => {
  it('lists the two size keys among the GM\'s tool keys, on [ and ], and not among the players\'', () => {
    expect(DEFAULT_MAP_HOTKEYS).toMatchObject({ draw: 'b', text: 't', erase: 'e', drawSmaller: ',', drawLarger: '.' });
    const gm = availableHotkeys().map((action) => action.id);
    expect(gm).toEqual(expect.arrayContaining(['draw', 'text', 'erase', 'drawSmaller', 'drawLarger']));
    const players = availableHotkeys(true).map((action) => action.id);
    for (const id of ['draw', 'text', 'erase', 'drawSmaller', 'drawLarger']) expect(players).not.toContain(id);
    // No other action has the keys.
    for (const key of [',', '.']) expect(Object.values(DEFAULT_MAP_HOTKEYS).filter((bound) => bound === key)).toHaveLength(1);
  });

  it('selects the tool in the mode it was left in, and steps through the modes when pressed again', () => {
    const store = mount();
    store.getState().setDrawTool({ mode: 'ellipse' });
    press('b');
    expect(tool(store)).toBe('draw');
    expect(mode(store)).toBe('ellipse');
    const seen: string[] = [];
    for (let step = 0; step < 8; step++) {
      press('b');
      seen.push(mode(store));
    }
    expect(seen).toEqual(['text', 'stamp', 'cells', 'eraser', 'pen', 'line', 'rectangle', 'ellipse']);
    expect(tool(store)).toBe('draw');
  });

  it('steps over the Cells mode on a map whose grid is switched off', () => {
    const store = mount();
    store.getState().setGridVisible(false);
    store.getState().setDrawTool({ mode: 'stamp' });
    press('b');
    press('b');
    expect(mode(store)).toBe('eraser');
  });

  it('selects the tool in Text mode with the text key, from another tool and from another mode', () => {
    const store = mount();
    press('t');
    expect(tool(store)).toBe('draw');
    expect(mode(store)).toBe('text');
    store.getState().setDrawTool({ mode: 'pen' });
    press('t');
    expect(mode(store)).toBe('text');
    expect(tool(store)).toBe('draw');
  });

  it('leaves the tool\'s mode alone in Session View, where its bars are locked: the text key only takes the tool into hand', () => {
    const store = mount();
    store.getState().setDrawTool({ mode: 'pen' });
    store.setState({ isGMView: false });
    press('t');
    expect([tool(store), mode(store)]).toEqual(['draw', 'pen']);
    // As the tool's own key and the eraser's leave it alone there.
    press('b');
    press('e');
    press('t');
    expect([tool(store), mode(store)]).toEqual(['draw', 'pen']);
    store.setState({ isGMView: true });
    press('t');
    expect(mode(store)).toBe('text');
  });

  it('switches to the tool\'s eraser and back to the mode before while drawing; elsewhere the key is the fog eraser', () => {
    const store = mount();
    press('e');
    expect(tool(store)).toBe('eraser');
    expect(mode(store)).toBe('pen');

    press('b');
    store.getState().setDrawTool({ mode: 'line' });
    press('e');
    expect(tool(store)).toBe('draw');
    expect(mode(store)).toBe('eraser');
    press('e');
    expect(mode(store)).toBe('line');
    // The eraser chosen in the bar goes back to the mode before it as well.
    store.getState().setDrawTool({ mode: 'rectangle' });
    store.getState().setDrawTool({ mode: 'eraser' });
    press('e');
    expect(mode(store)).toBe('rectangle');
  });

  it('steps the size only while the tool is in use, and never as an undo step', () => {
    const store = mount();
    press('.');
    expect(store.getState().drawTool.size).toBe('m');
    press('b');
    press('.');
    expect(store.getState().drawTool.size).toBe('l');
    press(',');
    press(',');
    press(',');
    expect(store.getState().drawTool.size).toBe('s');
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('steps one named size a press: a held key does not run through the four sizes', () => {
    const store = mount();
    press('b');
    press('.');
    expect(store.getState().drawTool.size).toBe('l');
    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: '.', repeat: true });
    expect(store.getState().drawTool.size).toBe('l');
  });

  it('takes no choice in the session view, where the bars take none: the tool is selected and keeps its mode and size', () => {
    const store = mount();
    store.getState().setGMView(false);
    press('b');
    expect(tool(store)).toBe('draw');
    press('b');
    press('e');
    press('.');
    expect(store.getState().drawTool).toMatchObject({ mode: 'pen', size: 'm' });
    expect(tool(store)).toBe('draw');
  });

  it('has no Draw tool in the players\' view', () => {
    const store = mount(true);
    press('b');
    press('t');
    expect(tool(store)).toBe('move');
    expect(mode(store)).toBe('pen');
    press('e');
    expect(tool(store)).toBe('move');
  });
});
