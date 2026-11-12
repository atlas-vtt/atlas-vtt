// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The bars are mounted inside the map's UI; no Obsidian app here.
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: undefined, view: null }),
}));

import type { MeasureInput } from '../../src/app/measure/measureTypes';
import { MeasureToolBar } from '../../src/app/packages/components/toolbar/MeasureToolBar';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The bars' places are measured in the browser (tests/gpu/measureToolBar.gpu.test.ts).
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const RULER: MeasureInput = { shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] };

function renderBar(playerView = false): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `measure-bar-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'measure', isMapLoading: false });
  // No tooltip provider around it: the map's bottom row has none, so the bars bring their own.
  render(<ViewStoreProvider store={store}><MeasureToolBar playerView={playerView} /></ViewStoreProvider>);
  return store;
}

const modesBar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Measure modes' });
const choicesBar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Measurements' });
const names = (bar: HTMLElement): string[] => within(bar).getAllByRole('button').map((item) => item.textContent ?? '');
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const pressed = (name: string): boolean => button(name).getAttribute('aria-pressed') === 'true';
const inert = (name: string): boolean => button(name).getAttribute('aria-disabled') === 'true';
const MODES = ['Ruler', 'Circle', 'Cone', 'Square', 'Line'];
/** The GM's bar ends with Ranges, which the players' view has not. */
const GM_MODES = [...MODES, 'Ranges'];
const CHOICES = ['Keep', 'Players see it', 'Colour', 'Clear'];

describe('MeasureToolBar', () => {
  it('shows while the measure tool is chosen, and not while the toolbar is arranged or a scene loads', async () => {
    const store = renderBar();
    const gone = (): Promise<void> => waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    modesBar();
    act(() => store.setState({ isToolbarEditing: true }));
    await gone();
    act(() => store.setState({ isToolbarEditing: false, isMapLoading: true }));
    await gone();
    act(() => store.setState({ isMapLoading: false, activeTool: 'move' }));
    await gone();
    act(() => store.setState({ activeTool: 'measure' }));
    modesBar();
  });

  it('keeps the modes in a bar of their own and the same four choices beside it in every mode', () => {
    const store = renderBar();
    expect(names(modesBar())).toEqual(GM_MODES);
    expect(names(choicesBar())).toEqual(CHOICES);
    expect(pressed('Ruler')).toBe(true);
    for (const [name, mode] of [['Circle', 'circle'], ['Cone', 'cone'], ['Ruler', 'ruler']] as const) {
      fireEvent.click(button(name));
      expect(store.getState().measureTool.mode).toBe(mode);
      expect(pressed(name)).toBe(true);
      expect(names(modesBar())).toEqual(GM_MODES);
      expect(names(choicesBar())).toEqual(CHOICES);
    }
  });

  it('switches Keep and Players in the store, pressed while on and tinted where a mode is filled', () => {
    const store = renderBar();
    expect(pressed('Keep')).toBe(false);
    expect(pressed('Players see it')).toBe(true);
    fireEvent.click(button('Keep'));
    fireEvent.click(button('Players see it'));
    expect(store.getState().measureTool).toMatchObject({ keep: true, players: false });
    expect(pressed('Keep')).toBe(true);
    expect(pressed('Players see it')).toBe(false);
    expect(button('Keep').classList.contains('atlas-tool-bar__choice')).toBe(true);
    expect(button('Ruler').classList.contains('atlas-tool-bar__choice')).toBe(false);
    // A key that switched Keep shows in the bar.
    act(() => store.getState().setMeasureTool({ keep: false }));
    expect(pressed('Keep')).toBe(false);
  });

  it('stays as it is in the session view, where measuring is the same', () => {
    const store = renderBar();
    act(() => store.setState({ isGMView: false }));
    expect([...MODES, 'Keep', 'Players see it', 'Colour'].some(inert)).toBe(false);
    fireEvent.click(button('Keep'));
    expect(store.getState().measureTool.keep).toBe(true);
  });

  it('gives the players\' view the modes alone', () => {
    const store = renderBar(true);
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
    expect(names(modesBar())).toEqual(MODES);
    fireEvent.click(button('Cone'));
    expect(store.getState().measureTool.mode).toBe('cone');
  });

  it('offers Clear only while the level shown has a kept measurement, and clears in one undo step', () => {
    const store = renderBar();
    const history = getHistoryStore(store)!;
    const kept = (): number => Object.keys(store.getState().objects.measures ?? {}).length;
    expect(inert('Clear')).toBe(true);
    fireEvent.click(button('Clear'));
    expect(history.getState().pastStates).toHaveLength(0);

    act(() => {
      store.getState().addMeasure(RULER);
      store.getState().addMeasure(RULER);
    });
    expect(inert('Clear')).toBe(false);
    const steps = history.getState().pastStates.length;
    fireEvent.click(button('Clear'));
    expect(kept()).toBe(0);
    expect(history.getState().pastStates).toHaveLength(steps + 1);
    expect(inert('Clear')).toBe(true);
    act(() => history.getState().undo());
    expect(kept()).toBe(2);
    expect(inert('Clear')).toBe(false);
  });

  it('counts only the level shown: a measurement kept on another level leaves Clear off and stays', () => {
    const store = renderBar();
    act(() => {
      store.setState({ levels: LEVELS, viewedLevel: 'upper' });
      store.getState().addMeasure({ ...RULER, level: 'ground' });
    });
    expect(inert('Clear')).toBe(true);
    fireEvent.click(button('Clear'));
    expect(Object.keys(store.getState().objects.measures ?? {})).toHaveLength(1);
    act(() => store.getState().setViewedLevel('ground'));
    expect(inert('Clear')).toBe(false);
  });

  it('opens the colours from the dot: the first is the theme\'s accent and stores none, the others their own', () => {
    const store = renderBar();
    const colours = (): HTMLElement | null => screen.queryByRole('group', { name: 'Colour' });
    expect(colours()).toBeNull();
    fireEvent.click(button('Colour'));
    const swatches = within(colours()!).getAllByRole('button');
    expect(swatches.map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['Default', 'White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple']);
    expect(swatches[0]!.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(swatches[2]!);
    expect(store.getState().measureTool.color).toBe('#e93147');
    // A choice closes the colours.
    expect(colours()).toBeNull();

    fireEvent.click(button('Colour'));
    expect(within(colours()!).getByRole('button', { name: 'Red' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(colours()!).getByRole('button', { name: 'Default' }));
    expect(store.getState().measureTool.color).toBeNull();
  });

  it('closes the colours on Escape and on a press outside them', () => {
    renderBar();
    const colours = (): HTMLElement | null => screen.queryByRole('group', { name: 'Colour' });
    fireEvent.click(button('Colour'));
    expect(colours()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(colours()).toBeNull();
    fireEvent.click(button('Colour'));
    fireEvent.mouseDown(document.body);
    expect(colours()).toBeNull();
  });
});
