// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

import { areaOutline, fogAreaList } from '../../src/app/fog/fogAreas';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { FogToolBar } from '../../src/app/packages/components/toolbar/FogToolBar';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { WallInput } from '../../src/app/types/wallTypes';
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
/** The four walls of a room, one per side. */
const roomWalls = (x: number, y: number, width: number, height: number): WallInput[] => [
  { type: 'solid', p1: { x, y }, p2: { x: x + width, y } },
  { type: 'solid', p1: { x: x + width, y }, p2: { x: x + width, y: y + height } },
  { type: 'solid', p1: { x: x + width, y: y + height }, p2: { x, y: y + height } },
  { type: 'solid', p1: { x, y: y + height }, p2: { x, y } },
];
const addWalls = (store: ViewAtlasStore, walls: readonly WallInput[]): string[] => walls.map((wall) => store.getState().addWall(wall));
const TOOLS = ['Brush', 'Rectangle', 'Polygon', 'Lasso', 'Cells', 'Room', 'Brush size', 'Cover all', 'Reveal all', 'More'];

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

  it('chooses Areas, which the hiding tool then makes, and leaves it for Hide or Reveal', () => {
    const { store } = renderBar();
    expect(['Hide', 'Reveal', 'Areas'].some(inert)).toBe(false);
    fireEvent.click(button('Areas'));
    expect(store.getState().fogTool.areas).toBe(true);
    expect(store.getState().activeTool).toBe('fog');
    expect(pressed('Areas')).toBe(true);
    expect(pressed('Hide')).toBe(false);
    // From revealing too.
    fireEvent.click(button('Reveal'));
    expect(store.getState().fogTool.areas).toBe(false);
    fireEvent.click(button('Areas'));
    expect(store.getState()).toMatchObject({ activeTool: 'fog', fogTool: { areas: true } });
    fireEvent.click(button('Hide'));
    expect(store.getState()).toMatchObject({ activeTool: 'fog', fogTool: { areas: false } });
    expect(pressed('Hide')).toBe(true);
  });

  it('shows the Brush in its place in Areas, not to be chosen, and takes the rectangle where the brush was', () => {
    const { store } = renderBar();
    expect(pressed('Brush')).toBe(true);
    fireEvent.click(button('Areas'));
    expect(store.getState().fogTool.shape).toBe('rectangle');
    expect(pressed('Rectangle')).toBe(true);
    expect(inert('Brush')).toBe(true);
    expect(names(toolsBar())).toEqual(TOOLS);
    fireEvent.click(button('Brush'));
    expect(store.getState().fogTool.shape).toBe('rectangle');
    // Every shape with an outline can be chosen, and stays when the tool hides again.
    for (const [name, shape] of [['Polygon', 'polygon'], ['Lasso', 'lasso'], ['Cells', 'cells'], ['Rectangle', 'rectangle']] as const) {
      fireEvent.click(button(name));
      expect(store.getState().fogTool.shape).toBe(shape);
    }
    fireEvent.click(button('Lasso'));
    fireEvent.click(button('Hide'));
    expect(pressed('Lasso')).toBe(true);
    expect(inert('Brush')).toBe(false);
    // A shape with an outline stays when Areas is chosen.
    fireEvent.click(button('Areas'));
    expect(store.getState().fogTool.shape).toBe('lasso');
  });

  it('falls back to the rectangle in Areas when the grid goes while Cells is chosen', () => {
    const { store } = renderBar();
    fireEvent.click(button('Areas'));
    fireEvent.click(button('Cells'));
    act(() => store.setState((state) => ({ grid: { ...state.grid, size: 0 } })));
    expect(store.getState().fogTool.shape).toBe('rectangle');
    expect(inert('Cells') && inert('Brush')).toBe(true);
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

  it('shows Room disabled on a level without walls, and falls back when the walls go while Room is chosen', () => {
    const { store } = renderBar();
    expect(inert('Room')).toBe(true);
    fireEvent.click(button('Room'));
    expect(store.getState().fogTool.shape).toBe('brush');
    // A wall that stops only light ends no room.
    act(() => { store.getState().addWall({ type: 'solid', blocks: 'light', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } }); });
    expect(inert('Room')).toBe(true);
    let walls: string[] = [];
    act(() => { walls = addWalls(store, roomWalls(140, 140, 280, 280)); });
    expect(inert('Room')).toBe(false);
    fireEvent.click(button('Room'));
    expect(store.getState().fogTool.shape).toBe('room');
    expect(pressed('Room')).toBe(true);
    // The size button is the brush's.
    expect(inert('Brush size')).toBe(true);
    // The walls go: the brush takes Room's place, and the bar keeps its buttons.
    act(() => store.getState().deleteWalls(walls));
    expect(inert('Room')).toBe(true);
    expect(store.getState().fogTool.shape).toBe('brush');
    expect(names(toolsBar())).toEqual(TOOLS);
    // In Areas, the rectangle does.
    act(() => { addWalls(store, roomWalls(140, 140, 280, 280)); });
    fireEvent.click(button('Areas'));
    fireEvent.click(button('Room'));
    expect(store.getState().fogTool.shape).toBe('room');
    act(() => store.getState().deleteWalls(Object.keys(store.getState().objects.walls)));
    expect(store.getState().fogTool.shape).toBe('rectangle');
  });

  it('counts the walls of the level shown: Room is off on a level whose walls are all on another', () => {
    const { store } = renderBar();
    act(() => {
      store.setState({ levels: LEVELS, viewedLevel: 'ground' });
      addWalls(store, roomWalls(140, 140, 280, 280));
    });
    expect(inert('Room')).toBe(false);
    fireEvent.click(button('Room'));
    act(() => store.getState().setViewedLevel('upper'));
    expect(inert('Room')).toBe(true);
    expect(store.getState().fogTool.shape).toBe('brush');
  });

  it('makes an area of every room from More, in one undo step, none of a room that is an area already, and says how many', () => {
    const { store } = renderBar();
    const history = getHistoryStore(store)!;
    const row = (): HTMLButtonElement => screen.getByRole('button', { name: 'Areas from walls' });
    fireEvent.click(button('More'));
    // Without walls the row stays, not to be chosen.
    expect(row().disabled).toBe(true);
    act(() => {
      addWalls(store, [...roomWalls(140, 140, 280, 280), ...roomWalls(700, 140, 210, 280), ...roomWalls(700, 490, 280, 140)]);
      // One room is an area already, drawn by hand a little off its walls.
      store.getState().addFogArea({ type: 'rectangle', x: 141, y: 139, width: 279, height: 282 }, 'Hall');
    });
    expect(row().disabled).toBe(false);
    const before = history.getState().pastStates.length;
    fireEvent.click(row());
    const areas = fogAreaList(store.getState().objects.fog);
    expect(areas).toHaveLength(3);
    expect(areas.filter((area) => area.type === 'lasso').map((area) => areaOutline(area).map(({ x, y }) => `${x},${y}`).sort())).toEqual(expect.arrayContaining([
      ['700,140', '700,420', '910,140', '910,420'],
      ['700,490', '700,630', '980,490', '980,630'],
    ]));
    // Hidden, each one click from revealed.
    expect(areas.every((area) => !area.isErasing)).toBe(true);
    expect(history.getState().pastStates).toHaveLength(before + 1);
    expect(showNotice).toHaveBeenLastCalledWith('2 areas made');
    // The menu closed on the choice.
    expect(screen.queryByRole('button', { name: 'Areas from walls' })).toBeNull();

    // Again: every room is an area, and nothing is written.
    fireEvent.click(button('More'));
    fireEvent.click(row());
    expect(fogAreaList(store.getState().objects.fog)).toHaveLength(3);
    expect(history.getState().pastStates).toHaveLength(before + 1);
    expect(showNotice).toHaveBeenLastCalledWith('Every room is an area already');

    act(() => history.getState().undo());
    expect(fogAreaList(store.getState().objects.fog)).toHaveLength(1);
  });

  it('says so where the walls enclose no room, or one room alone', () => {
    const { store } = renderBar();
    // Three sides of a room: its ground runs out to the map's edge.
    act(() => { addWalls(store, roomWalls(140, 140, 280, 280).slice(0, 3)); });
    fireEvent.click(button('More'));
    fireEvent.click(screen.getByRole('button', { name: 'Areas from walls' }));
    expect(fogOf(store)).toEqual([]);
    expect(showNotice).toHaveBeenLastCalledWith('No rooms found');
    act(() => { addWalls(store, roomWalls(140, 140, 280, 280).slice(3)); });
    fireEvent.click(button('More'));
    fireEvent.click(screen.getByRole('button', { name: 'Areas from walls' }));
    expect(fogOf(store)).toHaveLength(1);
    expect(showNotice).toHaveBeenLastCalledWith('1 area made');
  });

  it('says how wide the brush is in cells of the map\'s grid, and nothing on a map without one', () => {
    const { store } = renderBar();
    const value = (): string => document.querySelector('.atlas-dropdown-slider-row__value')!.textContent;
    act(() => store.setState((state) => ({ grid: { ...state.grid, type: 'square', size: 70, offsetX: 0, offsetY: 0 } })));
    fireEvent.click(button('Brush size'));
    // A brush of 50 px to either side of the pointer is 100 px wide: 1.4 cells of 70.
    expect(value()).toBe('1.4 cells');
    expect(screen.getByRole('slider', { name: 'Brush size' }).getAttribute('aria-valuetext')).toBe('1.4 cells');
    act(() => store.getState().setFogTool({ brushSize: 35 }));
    expect(value()).toBe('1 cell');
    act(() => store.getState().setFogTool({ brushSize: 200 }));
    expect(value()).toBe('5.7 cells');
    // Hexes are as wide as the grid's size too.
    act(() => store.setState((state) => ({ grid: { ...state.grid, type: 'hex-vertical', size: 100 } })));
    expect(value()).toBe('4 cells');
    // Without a grid there are no cells to count in, and pixels say nothing: no number.
    act(() => store.setState((state) => ({ grid: { ...state.grid, size: 0 } })));
    expect(value()).toBe('');
  });

  it('begins the More menu\'s actions with their icons, with no place kept for a tick', () => {
    renderBar();
    fireEvent.click(button('More'));
    for (const name of ['Areas from walls', 'Delete all areas']) {
      const row = screen.getByRole('button', { name });
      expect(row.classList.contains('atlas-dropdown-menu-item--flush')).toBe(true);
      expect(row.querySelector('.atlas-dropdown-menu-item__check')).toBeNull();
      expect(row.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    }
    // Deleting stays told apart as what it is.
    expect(screen.getByRole('button', { name: 'Delete all areas' }).classList.contains('atlas-dropdown-btn--destructive')).toBe(true);
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

  it('switches fog that clears around party tokens from More, with its distance, as a scene option and no undo step', () => {
    const { store } = renderBar();
    const history = getHistoryStore(store)!;
    const steps = history.getState().pastStates.length;
    const toggle = (): HTMLElement => screen.getByRole('switch', { name: 'Party tokens clear fog' });
    const slider = (): HTMLElement => screen.getByRole('slider', { name: 'Distance' });
    fireEvent.click(button('More'));
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    screen.getByText('Fog clears around a party token when it is moved, up to walls.');
    // The distance stays in place while the switch is off, and is not to be set.
    expect(slider().getAttribute('aria-valuetext')).toBe('4 cells');
    expect(slider().hasAttribute('data-disabled')).toBe(true);

    fireEvent.click(toggle());
    expect(store.getState().fogExplore).toEqual({ distance: 4 });
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(slider().hasAttribute('data-disabled')).toBe(false);
    act(() => slider().focus());
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(store.getState().fogExplore).toEqual({ distance: 5 });
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(store.getState().fogExplore).toEqual({ distance: 1 });
    expect(slider().getAttribute('aria-valuetext')).toBe('1 cell');
    fireEvent.keyDown(slider(), { key: 'End' });
    expect(store.getState().fogExplore).toEqual({ distance: 20 });

    // Off, and on again with the menu closed in between: the distance it had comes back.
    fireEvent.click(toggle());
    expect(store.getState().fogExplore).toBeUndefined();
    expect(slider().getAttribute('aria-valuetext')).toBe('20 cells');
    fireEvent.click(button('More'));
    fireEvent.click(button('More'));
    fireEvent.click(toggle());
    expect(store.getState().fogExplore).toEqual({ distance: 20 });
    expect(history.getState().pastStates).toHaveLength(steps);
  });

  it('shows the distance a scene holds beyond what the slider offers, and follows the scene', () => {
    const { store } = renderBar();
    act(() => store.getState().setFogExplore({ distance: 30 }));
    fireEvent.click(button('More'));
    const slider = screen.getByRole('slider', { name: 'Distance' });
    expect(slider.getAttribute('aria-valuenow')).toBe('30');
    expect(slider.getAttribute('aria-valuemax')).toBe('30');
    act(() => store.getState().setFogExplore(null));
    expect(screen.getByRole('switch', { name: 'Party tokens clear fog' }).getAttribute('aria-checked')).toBe('false');
  });

  it('deletes all areas of the level shown from More, in one undo step, and keeps the row where there are none', () => {
    const { store } = renderBar();
    const history = getHistoryStore(store)!;
    const row = (): HTMLButtonElement => screen.getByRole('button', { name: 'Delete all areas' });
    fireEvent.click(button('More'));
    expect(row().disabled).toBe(true);
    let plain = '';
    act(() => {
      plain = store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 50, height: 50 });
      store.getState().addFogArea({ type: 'rectangle', x: 100, y: 0, width: 50, height: 50 });
      store.getState().flipFogArea(store.getState().addFogArea({ type: 'rectangle', x: 200, y: 0, width: 50, height: 50 })!);
    });
    expect(row().disabled).toBe(false);
    const before = history.getState().pastStates.length;
    fireEvent.click(row());
    expect(Object.keys(store.getState().objects.fog)).toEqual([plain]);
    expect(history.getState().pastStates).toHaveLength(before + 1);
    // The menu closed on the choice.
    expect(screen.queryByRole('button', { name: 'Delete all areas' })).toBeNull();
    act(() => history.getState().undo());
    expect(fogOf(store)).toHaveLength(3);
  });

  it('names the level in the row of a scene with levels, and leaves the areas of other levels', () => {
    const { store } = renderBar();
    act(() => {
      store.setState({ levels: LEVELS, viewedLevel: 'ground' });
      store.getState().addFogArea({ type: 'rectangle', x: 100, y: 0, width: 50, height: 50 });
      store.getState().setViewedLevel('upper');
    });
    fireEvent.click(button('More'));
    const row = screen.getByRole<HTMLButtonElement>('button', { name: "Delete this level's areas" });
    expect(row.disabled).toBe(true);
    act(() => { store.getState().addFogArea({ type: 'rectangle', x: 100, y: 0, width: 50, height: 50 }); });
    fireEvent.click(row);
    expect(fogOf(store)).toEqual([expect.objectContaining({ level: 'ground' })]);
  });

  it('reveals all by revealing the areas, which stay, and has nothing to reveal once only revealed areas are left', () => {
    const { store } = renderBar();
    let hall = '';
    act(() => { hall = store.getState().addFogArea({ type: 'rectangle', x: 100, y: 0, width: 50, height: 50 })!; });
    expect(inert('Reveal all')).toBe(false);
    fireEvent.click(button('Reveal all'));
    expect(store.getState().objects.fog[hall]).toMatchObject({ isErasing: true });
    expect(inert('Reveal all')).toBe(true);
    fireEvent.click(button('Cover all'));
    expect(store.getState().objects.fog[hall]).toMatchObject({ isErasing: false });
    expect(inert('Reveal all')).toBe(false);
  });

  it('takes every choice in the session view too, where fog is painted as players see it', () => {
    const { store } = renderBar();
    act(() => store.setState({ isGMView: false }));
    expect(['Hide', 'Reveal', 'Brush', 'Rectangle', 'Lasso', 'Brush size', 'Cover all', 'More'].some(inert)).toBe(false);
    fireEvent.click(button('Lasso'));
    expect(store.getState().fogTool.shape).toBe('lasso');
  });
});
