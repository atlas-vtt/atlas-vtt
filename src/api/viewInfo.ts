import { showsTab } from '../app/services/PresentedScene';
import { loadedMapSize } from '../app/services/viewMapSize';
import type { ViewAtlasState } from '../app/storeFactory';
import type { TrackedMapView } from './viewTracker';
import { deepFrozen, frozenStoreValue } from './frozen';
import type { SceneSnapshot, ViewInfo } from './types/views';

export function isLoaded(state: Pick<ViewAtlasState, 'mapLoaded' | 'isMapLoading'>): boolean {
  return state.mapLoaded && !state.isMapLoading;
}

/** A frozen description of `view`: one object may reach several extensions (`map-loaded`), so none can change it for another. */
export function viewInfo(view: TrackedMapView): ViewInfo {
  const state = view.atlasStore.getState();
  const { tabs, activeTabId } = view.tabMetaStore.getState();
  return deepFrozen({
    viewId: view.viewId,
    kind: 'map',
    activeTabId,
    tabs: tabs.map((tab) => ({ tabId: tab.id, mapPath: tab.filePath, name: tab.displayName })),
    mapPath: state.mapPath,
    loaded: isLoaded(state),
  });
}

/**
 * The tab whose scene `view`'s store holds, loaded: its active tab once the store holds that tab's map. Null while a
 * map loads, and while the active tab already names the next tab but the store still holds the previous one.
 */
export function snapshotTabId(view: TrackedMapView): string | null {
  const { activeTabId } = view.tabMetaStore.getState();
  return activeTabId !== null && showsTab(view, activeTabId) ? activeTabId : null;
}

/** The fields a snapshot carries; a change to any of them (by reference) is a new snapshot. */
export function snapshotSlice(view: TrackedMapView): readonly unknown[] {
  const state = view.atlasStore.getState();
  return [
    snapshotTabId(view), state.mapPath, state.mapLoaded, state.isMapLoading, state.background, state.grid,
    state.objects.tokens, state.objects.texts, state.objects.drawings, state.objects.fog,
    state.widgetSettings, state.widgetValues, state.initiative, state.initiativeTrackerOpen, state.lighting,
  ];
}

/**
 * The scene in `view`'s store: the store's frozen Immer records by reference, and a frozen copy of any not frozen yet
 * (`frozenStoreValue`), so a listener can never change what Atlas saves.
 */
export function sceneSnapshot(view: TrackedMapView): SceneSnapshot {
  const state = view.atlasStore.getState();
  const kept = frozenStoreValue;
  return Object.freeze({
    viewId: view.viewId,
    mapPath: state.mapPath,
    loaded: isLoaded(state),
    tabId: snapshotTabId(view),
    mapSize: Object.freeze(loadedMapSize(view)),
    background: state.background,
    grid: kept(state.grid),
    objects: Object.freeze({ tokens: kept(state.objects.tokens), texts: kept(state.objects.texts), drawings: kept(state.objects.drawings), fog: kept(state.objects.fog) }),
    widgets: Object.freeze({ settings: kept(state.widgetSettings), values: kept(state.widgetValues) }),
    initiative: kept(state.initiative),
    initiativeTrackerOpen: state.initiativeTrackerOpen,
    lighting: kept(state.lighting),
  });
}
