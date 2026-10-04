import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from 'src/app/storeFactory';

/**
 * The Obsidian app of each view store, so canvas code that only holds the
 * store (context menus of drawings, texts, pins and tokens) can open the
 * world-time dialogs. Bound by `WorldTimeController`.
 */
const apps = new WeakMap<StoreApi<ViewAtlasState>, App>();

export function bindWorldApp(store: StoreApi<ViewAtlasState>, app: App): void {
  apps.set(store, app);
}

export function worldAppOf(store: StoreApi<ViewAtlasState>): App | undefined {
  return apps.get(store);
}
