// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

import type { MapRect } from '../../src/app/grid/cellNumbering';
import { FogToolBar } from '../../src/app/packages/components/toolbar/FogToolBar';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { showNotice } from '../../src/app/ui/notice';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPluginData } from '../mocks/pluginData';

// The bars' places are the shared bars', measured in the browser (tests/gpu/measureToolBar.gpu.test.ts).
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.mocked(showNotice).mockClear();
});

const MAP: MapRect = { x: 0, y: 0, width: 1400, height: 700 };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

/** The bar over a scene whose map is `mapRect`, with Atlas' settings of this device. */
function renderBar(mapRect: MapRect | null = MAP): { store: ViewAtlasStore; settings: SettingsService } {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app, undefined, memoryPluginData({}));
  const store = createViewAtlasStore(app, `fog-bar-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'fog', isMapLoading: false });
  const ui = { app, view: null, pixiApp: null, renderer: { getMapRect: () => mapRect } } as unknown as AtlasUIContextValue;
  // No tooltip provider around it: the map's bottom row has none, so the bars bring their own.
  render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}><FogToolBar /></ViewStoreProvider></AtlasUIContext.Provider>);
  return { store, settings };
}

const whatBar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Fog' });
const toolsBar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Fog shapes and actions' });
const names = (bar: HTMLElement): string[] => within(bar).getAllByRole('button').map((item) => item.textContent ?? '');
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const pressed = (name: string): boolean => button(name).getAttribute('aria-pressed') === 'true';
const inert = (name: string): boolean => button(name).getAttribute('aria-disabled') === 'true';
const fogOf = (store: ViewAtlasStore): unknown[] => Object.values(store.getState().objects.fog);
const WHATS = ['Hide', 'Reveal', 'Areas'];
const TOOLS = ['Brush', 'Rectangle', 'Polygon', 'Lasso', 'Cells', 'Brush size', 'Cover all', 'Reveal all', 'More'];

describe('FogToolBar', () => {
  it('shows while the fog tool hides or reveals, and not for another tool, while the toolbar is arranged, a scene loads, or for players', async () => {
    const { store } = renderBar();
    const gone = (): Promise<void> => waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    whatBar();
    act(() => store.setState({ activeTool: 'eraser' }));
    whatBar();
    act(() => store.setState({ isToolbarEditing: true }));
    await gone();
    act(() => store.setState({ isToolbarEditing: false, isMapLoading: true }));
    await gone();
    act(() => store.setState({ isMapLoading: false, isPlayerView: true }));
    await gone();
    act(() => store.setState({ isPlayerView: false, activeTool: 'move' }));
    await gone();
    act(() => store.setState({ activeTool: 'fog' }));
    whatBar();
  });

  it('keeps what the tool does in a bar of its own, and the same buttons beside it whatever is chosen', () => {
    const { store } = renderBar();
    expect(names(whatBar())).toEqual(WHATS);
    expect(names(toolsBar())).toEqual(TOOLS);
    expect(pressed('Hide')).toBe(true);
    for (const [name, tool] of [['Reveal', 'eraser'], ['Hide', 'fog']] as const) {
      fireEvent.click(button(name));
      expect(store.getState().activeTool).toBe(tool);
      expect(pressed(name)).toBe(true);
      expect(names(whatBar())).toEqual(WHATS);
      expect(names(toolsBar())).toEqual(TOOLS);
    }
    // The tool's key shows in the bar.
    act(() => store.getState().setActiveTool('eraser'));
    expect(pressed('Reveal')).toBe(true);
    expect(pressed('Hide')).toBe(false);
  });

  it('shows Areas in its place, not to be chosen yet', () => {
    const { store } = renderBar();
    expect(inert('Areas')).toBe(true);
    expect(inert('Hide') || inert('Reveal')).toBe(false);
    fireEvent.click(button('Areas'));
    expect(store.getState().fogTool.areas).toBe(false);
    expect(store.getState().activeTool).toBe('fog');
    expect(pressed('Hide')).toBe(true);
  });

  it('chooses the shape in the store, tinted where what the tool does is filled', () => {
    const { store } = renderBar();
    expect(pressed('Brush')).toBe(true);
    for (const [name, shape] of [['Rectangle', 'rectangle'], ['Polygon', 'polygon'], ['Lasso', 'lasso'], ['Cells', 'cells'], ['Brush', 'brush']] as const) {
      fireEvent.click(button(name));
      expect(store.getState().fogTool.shape).toBe(shape);
      expect(pressed(name)).toBe(true);
    }
    expect(button('Brush').classList.contains('atlas-tool-bar__choice')).toBe(true);
    expect(button('Hide').classList.contains('atlas-tool-bar__choice')).toBe(false);
    // The shape stays when the tool turns to revealing.
    fireEvent.click(button('Lasso'));
    fireEvent.click(button('Reveal'));
    expect(pressed('Lasso')).toBe(true);
  });

  it('shows Cells disabled on a map without a grid, and falls back to the brush when the grid goes while Cells is chosen', () => {
    const { store } = renderBar();
    expect(inert('Cells')).toBe(false);
    fireEvent.click(button('Cells'));
    expect(store.getState().fogTool.shape).toBe('cells');
    act(() => store.setState((state) => ({ grid: { ...state.grid, size: 0 } })));
    expect(inert('Cells')).toBe(true);
    expect(store.getState().fogTool.shape).toBe('brush');
    expect(pressed('Brush')).toBe(true);
    // In its place, not to be chosen: the bar keeps its buttons.
    expect(names(toolsBar())).toEqual(TOOLS);
    fireEvent.click(button('Cells'));
    expect(store.getState().fogTool.shape).toBe('brush');
    // No other shape needs the grid.
    expect(['Brush', 'Rectangle', 'Polygon', 'Lasso'].some(inert)).toBe(false);
    act(() => store.setState((state) => ({ grid: { ...state.grid, size: 70 } })));
    expect(inert('Cells')).toBe(false);
    expect(store.getState().fogTool.shape).toBe('brush');
  });

  it('opens the brush\'s size from the size button, whose dot grows with the brush', () => {
    const { store } = renderBar();
    const slider = (): HTMLElement | null => screen.queryByRole('slider', { name: 'Brush size' });
    const dot = (): number => Number.parseFloat(button('Brush size').querySelector<HTMLElement>('.atlas-fog-size-dot')!.style.width);
    expect(slider()).toBeNull();
    expect(button('Brush size').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button('Brush size'));
    expect(button('Brush size').getAttribute('aria-expanded')).toBe('true');
    expect(slider()!.getAttribute('aria-valuenow')).toBe('50');
    act(() => slider()!.focus());
    fireEvent.keyDown(slider()!, { key: 'ArrowRight' });
    expect(store.getState().fogTool.brushSize).toBe(51);
    // The keys' steps show in the slider and on the button.
    const small = dot();
    act(() => store.getState().setFogTool({ brushSize: 200 }));
    expect(slider()!.getAttribute('aria-valuenow')).toBe('200');
    expect(dot()).toBeGreaterThan(small);
    act(() => store.getState().setFogTool({ brushSize: 10 }));
    expect(dot()).toBeLessThan(small);
    expect(dot()).toBeGreaterThan(0);
    fireEvent.click(button('Brush size'));
    expect(slider()).toBeNull();
  });

  it('keeps the size button beside another shape, disabled, and closes its slider for good', () => {
    const { store } = renderBar();
    const slider = (): HTMLElement | null => screen.queryByRole('slider', { name: 'Brush size' });
    fireEvent.click(button('Brush size'));
    expect(slider()).not.toBeNull();
    fireEvent.click(button('Rectangle'));
    expect(slider()).toBeNull();
    expect(inert('Brush size')).toBe(true);
    expect(names(toolsBar())).toEqual(TOOLS);
    // Only the brush has a size: the other shapes leave the button as it is.
    for (const name of ['Polygon', 'Lasso', 'Cells']) {
      fireEvent.click(button(name));
      expect(inert('Brush size')).toBe(true);
      expect(names(toolsBar())).toEqual(TOOLS);
    }
    fireEvent.click(button('Brush size'));
    expect(slider()).toBeNull();
    fireEvent.click(button('Brush'));
    expect(inert('Brush size')).toBe(false);
    expect(slider()).toBeNull();
    expect(store.getState().fogTool.brushSize).toBe(50);
  });

  it('covers the whole map in one undo step, and reveals all in another', () => {
    const { store } = renderBar();
    const history = getHistoryStore(store)!;
    expect(inert('Reveal all')).toBe(true);
    fireEvent.click(button('Reveal all'));
    expect(history.getState().pastStates).toHaveLength(0);

    fireEvent.click(button('Cover all'));
    expect(fogOf(store)).toEqual([expect.objectContaining({ type: 'rectangle', isErasing: false, ...MAP })]);
    expect(history.getState().pastStates).toHaveLength(1);
    expect(inert('Reveal all')).toBe(false);

    fireEvent.click(button('Reveal all'));
    expect(fogOf(store)).toEqual([]);
    expect(history.getState().pastStates).toHaveLength(2);
    expect(inert('Reveal all')).toBe(true);
    act(() => history.getState().undo());
    expect(fogOf(store)).toHaveLength(1);
    act(() => history.getState().undo());
    expect(fogOf(store)).toEqual([]);
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('says so where the scene has no map to cover, and covers nothing', () => {
    const { store } = renderBar(null);
    fireEvent.click(button('Cover all'));
    expect(fogOf(store)).toEqual([]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    expect(showNotice).toHaveBeenCalledWith('This scene has no map to cover.');
  });

  it('counts only the level shown: fog on another level leaves Reveal all off and stays', () => {
    const { store } = renderBar();
    act(() => {
      store.setState({ levels: LEVELS, viewedLevel: 'ground' });
      store.getState().coverAllFog(MAP);
      store.getState().setViewedLevel('upper');
    });
    expect(inert('Reveal all')).toBe(true);
    fireEvent.click(button('Reveal all'));
    expect(fogOf(store)).toHaveLength(1);
    act(() => store.getState().setViewedLevel('ground'));
    expect(inert('Reveal all')).toBe(false);
  });

  it('sets how opaque fog is in the GM\'s view from More, kept on this device', () => {
    const { settings } = renderBar();
    const slider = (): HTMLElement | null => screen.queryByRole('slider', { name: 'Fog opacity in GM View' });
    expect(slider()).toBeNull();
    fireEvent.click(button('More'));
    expect(slider()!.getAttribute('aria-valuenow')).toBe('50');
    expect(slider()!.getAttribute('aria-valuetext')).toBe('50%');
    act(() => slider()!.focus());
    fireEvent.keyDown(slider()!, { key: 'ArrowRight' });
    expect(settings.getGmFogOpacity()).toBe(0.55);
    expect(slider()!.getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(slider()!, { key: 'End' });
    expect(settings.getGmFogOpacity()).toBe(1);
    fireEvent.keyDown(slider()!, { key: 'Home' });
    expect(settings.getGmFogOpacity()).toBe(0.1);
    fireEvent.click(button('More'));
    expect(slider()).toBeNull();
  });

  it('takes every choice in the session view too, where fog is painted as players see it', () => {
    const { store } = renderBar();
    act(() => store.setState({ isGMView: false }));
    expect(['Hide', 'Reveal', 'Brush', 'Rectangle', 'Lasso', 'Brush size', 'Cover all', 'More'].some(inert)).toBe(false);
    fireEvent.click(button('Lasso'));
    expect(store.getState().fogTool.shape).toBe('lasso');
  });
});
