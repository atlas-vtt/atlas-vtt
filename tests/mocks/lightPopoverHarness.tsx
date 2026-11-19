import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LightPopoverHost } from '../../src/app/pixi/lighting/LightPopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { LightSource } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from './inMemoryVault';
import { genericLight } from './lights';

/** The light popover over a map with a torch and a lantern, as its tests open and use it. */

export interface Rendered {
  store: ViewAtlasStore;
  torch: string;
  lantern: string;
  light: (id?: string) => LightSource;
  steps: () => number;
  undo: () => void;
  mapKeys: ReturnType<typeof vi.fn>;
}

export function renderPopover(open = true): Rendered {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-popover-ui-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/popover.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const torch = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
  const lantern = store.getState().addLight({ x: 600, y: 300, emission: { ...genericLight('lantern'), kind: 'lantern' } });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  // The map's shortcuts listen on the window; the popover's own keys must not reach them.
  const mapKeys = vi.fn();
  window.addEventListener('keydown', mapKeys);
  render(
    <button type="button">Map</button>,
  );
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><LightPopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  if (open) act(() => { store.getState().openLightPopover(torch); });
  return {
    store, torch, lantern, mapKeys,
    light: (id = torch) => store.getState().objects.lights[id]!,
    steps: () => history.getState().pastStates.length,
    undo: () => act(() => { history.getState().undo(); }),
  };
}

export const popover = (): HTMLElement => screen.getByRole('dialog', { name: 'Light' });
