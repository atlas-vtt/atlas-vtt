import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

export const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

const SQUARE = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }];

/** The objects a map popover opens on. */
export type PopoverObject = 'light' | 'zone' | 'link' | 'surface' | 'measure';

/** Adds one object of each kind a popover opens on, on the level shown (the stairs join both levels); returns its id. */
export const ADD: Readonly<Record<PopoverObject, (store: ViewAtlasStore) => string>> = {
  light: (store) => store.getState().addObject('lights', { x: 10, y: 10, emission: { bright: 20, dim: 40, color: '#ffffff', intensity: 1 } }),
  zone: (store) => store.getState().addObject('lightZones', { polygon: SQUARE, ambient: 0.2 }),
  link: (store) => store.getState().addObject('levelLinks', { polygon: SQUARE, levels: ['ground', 'upper'] }),
  surface: (store) => store.getState().addObject('levelSurfaces', { polygon: SQUARE, open: true }),
  measure: (store) => store.getState().addMeasure({ shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] })!,
};

export interface SurfaceView {
  store: ViewAtlasStore;
  ids: Record<PopoverObject, string>;
  state: () => ViewAtlasState;
}

/**
 * The GM's view of a loaded scene of two levels, shown on the ground floor, lit, as the map
 * composes it, holding one light, zone, stairs, opening and kept measurement. No undo step yet.
 */
export function surfaceView(): SurfaceView {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `view-surfaces-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'ground',
    lighting: { ...store.getState().lighting, enabled: true },
  });
  const ids = { light: ADD.light(store), zone: ADD.zone(store), link: ADD.link(store), surface: ADD.surface(store), measure: ADD.measure(store) };
  getHistoryStore(store)!.getState().clear();
  return { store, ids, state: () => store.getState() };
}

export function undo(view: SurfaceView): void {
  getHistoryStore(view.store)!.getState().undo();
}
