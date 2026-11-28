import type { App, WorkspaceLeaf } from 'obsidian';
import { isAtlasView } from '../../atlasViewType';
import type { ViewAtlasStore } from '../../storeFactory';
import { ATLAS_VIEW_TYPE, type ObservedStore, type SceneStore } from './atlasView.ts';
import type { MapView } from './mapView.ts';

/**
 * The leaf's Atlas map view, or null for any other leaf: another view, or a tab Obsidian has not loaded yet,
 * whose placeholder answers Atlas's view type and has nothing else of the view. The one place an Obsidian view
 * is taken for an Atlas one; handing it out as a `MapView` holds every name the table reads to Atlas's own.
 */
export function mapViewOf(leaf: WorkspaceLeaf): MapView | null {
  if (!isAtlasView(leaf.view)) return null;
  // Atlas's store writes through immer, which its declared type leaves out: a recipe handed to `setState` is one write.
  const view: Omit<MapView, 'atlasStore'> & { readonly atlasStore: Pick<ViewAtlasStore, 'getState' | 'subscribe' | 'setState'> } = leaf.view;
  return view as MapView;
}

/** The store of an Atlas map tab, or null for any other leaf. */
export function sceneStoreOf(leaf: WorkspaceLeaf): ObservedStore | null {
  return mapViewOf(leaf)?.atlasStore ?? null;
}

/** The Atlas map tab the GM works in: the most recent leaf if it is one, else the only one open. */
export function activeAtlasLeaf(app: App): WorkspaceLeaf | null {
  const recent = app.workspace.getMostRecentLeaf();
  if (recent !== null && sceneStoreOf(recent) !== null) return recent;
  const leaves = app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE);
  return leaves.length === 1 && leaves[0] !== undefined && sceneStoreOf(leaves[0]) !== null ? leaves[0] : null;
}

/** The store of the active Atlas tab, or null while none is active. */
export function activeStore(app: App): SceneStore | null {
  const leaf = activeAtlasLeaf(app);
  return leaf === null ? null : sceneStoreOf(leaf);
}
