// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneLevelsPanel } from '../../../src/app/react/components/command-palette/SceneLevelsPanel';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { GridState } from '../../../src/app/types/gridTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const sizes = vi.hoisted(() => new Map<string, { width: number; height: number }>());
vi.mock('../../../src/app/pixi/mosaicCanvas/mosaicCanvasSize', () => ({ mosaicCanvasSize: async (_app: unknown, path: string) => sizes.get(path) ?? null }));
/** The image the GM picks in the map library; the picker answers at once. */
const picked = vi.hoisted(() => ({ path: null as string | null }));
vi.mock('../../../src/app/react/components/levels/MapImagePickerModal', () => ({
  pickMapImage: async (_app: unknown, _collection: unknown, onChoose: (path: string | null) => void) => onChoose(picked.path),
}));

const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0, visible: true, snapToGrid: true } as GridState;
const REPLACE = /^Replace the map image of /;
const CHANGE = /^Change the map image of /;

beforeEach(() => {
  sizes.clear();
  sizes.set('maps/still.png', { width: 2000, height: 1000 });
  sizes.set('maps/gridless.png', { width: 2000, height: 1000 });
  sizes.set('maps/animated.webm', { width: 4000, height: 2000 });
});
afterEach(cleanup);

function open(scene: { levels?: SceneLevel[]; background?: string | null } = {}): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `one-floor-${Math.random()}`);
  const background = 'background' in scene ? scene.background! : 'maps/still.png';
  store.setState({ persistenceEnabled: false, mapPath: 'scenes/castle.atlasmap', mapLoaded: true, background, grid: GRID, levels: scene.levels, viewedLevel: scene.levels?.at(-1)?.id ?? null });
  getHistoryStore(store)?.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}><SceneLevelsPanel /></ViewStoreProvider></AtlasUIContext.Provider>);
  return store;
}

const press = (name: RegExp | string): void => { act(() => { fireEvent.click(screen.getByRole('button', { name })); }); };

describe('the Scene levels page of a scene with one floor', () => {
  it('has a row for that floor, with its map image to change or replace, and its roof', () => {
    open();
    expect(screen.getByRole('textbox', { name: 'Name of Ground floor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: CHANGE })).toBeTruthy();
    expect(screen.getByRole('button', { name: REPLACE })).toHaveProperty('disabled', false);
    expect(screen.getByText('No roof')).toBeTruthy();
    expect(screen.getByText(/This scene has one level/)).toBeTruthy();
  });

  it('offers nothing a single floor has no use for: no reordering, no deleting, nothing below', () => {
    open();
    for (const name of [/^Move .* up$/, /^Move .* down$/, /^Delete /, /^No level lies below /]) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('replaces the map of a scene without levels with another version of it', async () => {
    const store = open();
    picked.path = 'maps/gridless.png';
    press(REPLACE);
    await waitFor(() => expect(store.getState().background).toBe('maps/gridless.png'));
    expect(store.getState().levels).toBeUndefined();
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });

  it('fits a larger version onto the old map, and still shows the one row', async () => {
    const store = open();
    picked.path = 'maps/animated.webm';
    press(REPLACE);
    await waitFor(() => expect(store.getState().background).toBe('maps/animated.webm'));
    const [only] = store.getState().levels!;
    expect(store.getState().levelAlignments?.[only!.id]?.scale).toBe(0.5);
    expect(screen.getAllByRole('button', { name: REPLACE })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
  });

  it('replaces the map of a scene whose one level a roof made', async () => {
    const store = open({ levels: [{ id: 'ground', name: 'Hall', elevation: { bottom: 0, top: 10 }, background: 'maps/still.png', foreground: 'maps/roof.png' }] });
    expect(screen.getByRole('textbox', { name: 'Name of Hall' })).toBeTruthy();
    expect(screen.getByText('roof.png')).toBeTruthy();
    picked.path = 'maps/gridless.png';
    press(REPLACE);
    await waitFor(() => expect(store.getState().background).toBe('maps/gridless.png'));
    expect(store.getState().levels).toHaveLength(1);
  });

  it('shows another map image on the scene, which stays without levels', async () => {
    const store = open();
    picked.path = 'maps/gridless.png';
    press(CHANGE);
    await waitFor(() => expect(store.getState().background).toBe('maps/gridless.png'));
    expect(store.getState().levels).toBeUndefined();
  });

  it('has nothing to replace while the scene has no map image', () => {
    open({ background: null });
    expect(screen.getByRole('button', { name: REPLACE })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: CHANGE })).toHaveProperty('disabled', false);
  });

  it('names the floor of a scene without levels, which gets its one level to carry the name, no undo step', () => {
    const store = open();
    const name = screen.getByRole('textbox', { name: 'Name of Ground floor' });
    act(() => { fireEvent.change(name, { target: { value: 'Cellar' } }); });
    act(() => { fireEvent.blur(name); });
    expect(store.getState().levels).toMatchObject([{ name: 'Cellar', elevation: { bottom: 0, top: 10 }, background: 'maps/still.png' }]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Name of Cellar' })).toHaveProperty('value', 'Cellar');
  });

  it('makes no level for a field that was only looked at', () => {
    const store = open();
    for (const field of ['Name of Ground floor', 'Bottom of Ground floor', 'Top of Ground floor']) {
      const input = screen.getByRole('textbox', { name: field });
      act(() => { fireEvent.focus(input); });
      act(() => { fireEvent.blur(input); });
    }
    expect(store.getState().levels).toBeUndefined();
  });

  it('sets the elevation of the floor of a scene without levels', () => {
    const store = open();
    const top = screen.getByRole('textbox', { name: 'Top of Ground floor' });
    act(() => { fireEvent.change(top, { target: { value: '15' } }); });
    act(() => { fireEvent.blur(top); });
    expect(store.getState().levels).toMatchObject([{ name: 'Ground floor', elevation: { bottom: 0, top: 15 } }]);
  });
});

describe('the Scene levels page of a scene with several floors', () => {
  it('keeps every control on each row, and no hint', () => {
    open({ levels: [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/still.png' },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
    ] });
    for (const name of ['Move Upper up', 'Move Upper down', 'Delete Upper', 'Roof of Upper', 'What Upper shows of the levels below', 'No level lies below Ground', 'Delete Ground']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: REPLACE })).toHaveLength(2);
    expect(screen.queryByText(/This scene has one level/)).toBeNull();
  });
});
