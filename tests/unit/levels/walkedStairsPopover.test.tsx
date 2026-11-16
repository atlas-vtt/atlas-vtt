// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LevelLinkPopoverHost } from '../../../src/app/react/components/levels/LevelLinkPopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

afterEach(cleanup);

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];
/** Two cells wide and three long on a grid of 100 px: edge 0 (the top) is one of its short ends. */
const LONG = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }];

function mount(link: LevelLink): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `walked-popover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({
    mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'ground', activeTool: 'stairs',
    grid: { ...store.getState().grid!, size: 100 },
    objects: { ...store.getState().objects, levelLinks: { [link.id]: link } },
  });
  store.getState().openLevelLinkPopover(link.id);
  getHistoryStore(store)?.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}><LevelLinkPopoverHost /></ViewStoreProvider></AtlasUIContext.Provider>);
  return store;
}

const walked = (): HTMLElement => screen.getByRole('switch', { name: 'Walked from one end' });
const flight = (store: ViewAtlasStore): LevelLink['flight'] => store.getState().objects.levelLinks!.stairs!.flight;

describe('walked stairs in the stairs popover', () => {
  it('walks drawn stairs from a short end, as many rows as they are cells long, and turns the foot round edge by edge, one undo step each', () => {
    const store = mount({ id: 'stairs', kind: 'level-link', polygon: LONG, levels: ['ground', 'upper'] });
    expect(screen.getByRole('button', { name: 'Turn' }).hasAttribute('disabled')).toBe(true);
    act(() => fireEvent.click(walked()));
    expect(flight(store)).toEqual({ foot: 0, rows: 3 });
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Turn' })));
    expect(flight(store)).toEqual({ foot: 1, rows: 2 });
    act(() => fireEvent.click(walked()));
    expect(flight(store)).toBeUndefined();
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(3);
  });

  it('is offered, switched off, only where stairs can be walked: four corners and two levels', () => {
    mount({ id: 'stairs', kind: 'level-link', polygon: LONG, levels: ['ground', 'upper', 'roof'] });
    expect(walked().getAttribute('aria-disabled') === 'true' || walked().hasAttribute('disabled')).toBe(true);
  });
});
