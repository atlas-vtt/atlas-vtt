// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import { LevelSwitcher } from '../../../src/app/react/components/levels/LevelSwitcher';
import { useMapNavigationHotkeys } from '../../../src/app/react/useMapNavigationHotkeys';
import { createTabMetaStore } from '../../../src/app/stores/tabMetaStore';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { AtlasView } from '../../../src/app/atlas-view';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const presentTab = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../src/app/services/PlayerWindowPresenter', () => ({ presentTab }));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];

function MapUI({ store, view }: { store: ViewAtlasStore; view: AtlasView }): React.ReactElement {
  useMapNavigationHotkeys(view, store, undefined);
  return <LevelSwitcher />;
}

/** A map view in the active Obsidian leaf, its switcher shown. */
function showSwitcher(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `level-switcher-keys-${Math.random()}`);
  store.setState({ persistenceEnabled: false, levels: LEVELS, viewedLevel: 'ground' });
  const tabMetaStore = createTabMetaStore();
  tabMetaStore.getState().setActiveTab(tabMetaStore.getState().addTab('maps/tower.atlasmap', 'Tower'));
  const view = { viewId: 'switcher-view', tabMetaStore } as unknown as AtlasView;
  const leaf = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  const host = leaf.createDiv({ attr: { 'data-view-id': 'switcher-view' } });
  render(
    <AtlasUIContext.Provider value={{ app, view, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><MapUI store={store} view={view} /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
    { container: host },
  );
  return store;
}

afterEach(() => { document.body.empty(); });

describe('the level keys while focus is on the level switcher', () => {
  it('show the level above and below after a click on an eye', () => {
    const store = showSwitcher();
    const eyes = screen.getAllByRole('button');
    const roofEye = eyes[0]!;

    act(() => {
      roofEye.focus();
      fireEvent.click(roofEye);
    });
    expect(presentTab).toHaveBeenCalled();

    act(() => { fireEvent.keyDown(roofEye, { key: 'PageUp', code: 'PageUp' }); });
    expect(store.getState().viewedLevel).toBe('upper');
    act(() => { fireEvent.keyDown(roofEye, { key: 'PageDown', code: 'PageDown' }); });
    expect(store.getState().viewedLevel).toBe('ground');
  });

  it('show the level above from a floor of the switcher, whose own keys stay Enter and Space', () => {
    const store = showSwitcher();
    const [roof] = screen.getAllByRole('tab');

    act(() => { fireEvent.keyDown(roof!, { key: 'PageUp', code: 'PageUp' }); });
    expect(store.getState().viewedLevel).toBe('upper');
    act(() => { fireEvent.keyDown(roof!, { key: 'Enter', code: 'Enter' }); });
    expect(store.getState().viewedLevel).toBe('roof');
  });

  it('leave Enter on an eye to the eye, never to its floor', () => {
    const store = showSwitcher();
    const roofEye = screen.getAllByRole('button')[0]!;

    act(() => { fireEvent.keyDown(roofEye, { key: 'Enter', code: 'Enter' }); });

    expect(store.getState().viewedLevel).toBe('ground');
  });
});
