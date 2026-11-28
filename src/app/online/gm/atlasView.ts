import type { App, WorkspaceLeaf } from 'obsidian';
import type { ShownRollToken } from '../../services/playerRollSource';
import type { TokenEntity } from '../../types';
import type { ViewState } from '../../types/viewState';
import type { AtlasView } from '../../atlas-view';
import type { ViewAtlasStore } from '../../storeFactory';
import type { MapView } from './mapView.ts';

/** The view type of Atlas's map tabs; a test holds it to the vendor's `ATLAS_VIEW_TYPE`. */
export const ATLAS_VIEW_TYPE = 'atlas-vtt';
/** The view type of Atlas's local player window; a test holds it to the vendor's `LOCAL_PLAYER_VIEW_TYPE`. */
export const LOCAL_PLAYER_VIEW_TYPE = 'atlas-vtt-local-player';

/** The part of an Atlas map tab's store the companion reads. */
export type SceneState = Pick<ViewState, 'mapPath' | 'mapLoaded' | 'isMapLoading' | 'background' | 'lighting' | 'objects' | 'grid' | 'heldTokens' | 'exploredMask' | 'exploredEdits' | 'isDragging' | '_audioDirty'>
  & Partial<Pick<ViewState, 'tokenSettings' | 'levels' | 'viewedLevel' | 'exploredMasks' | 'exploredForgotten' | 'levelAlignments' | 'isPlayerView'>>;

/**
 * What the companion asks of an Atlas tab's renderer (`PixiRendererOrchestrator`): the tokens the
 * players' frame of a scene shows (not hidden, seen, not under fog) and the grid they are sized by.
 */
export interface PlayerTokenSource {
  playerRollTokens(mapPath: string, tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken>;
  getGridOptions(): { readonly size: number } | null;
}

/** An Atlas map tab's store, as far as the shares use it: what it holds, and writes. */
export interface SceneStore {
  getState(): SceneState;
  /** A write through Atlas's own middleware (immer and history): one undo step. */
  setState(recipe: (draft: SceneState) => void): void;
  /** Whether the GM's view shows what this store holds (a floor's store: that floor); unset, it does. */
  shown?(): boolean;
}

/** A store that tells of its changes: Atlas's own, and the presented scene's (`PresentedStore`). */
export interface ObservedStore extends SceneStore {
  subscribe(listener: (state: SceneState) => void): () => void;
}

/**
 * The leaf's Atlas map view, or null for any other leaf. The one place an Obsidian view is taken for an Atlas
 * one, by its type; handing it out as a `MapView` holds every name the table reads to Atlas's own.
 */
export function mapViewOf(leaf: WorkspaceLeaf): MapView | null {
  if (leaf.view.getViewType() !== ATLAS_VIEW_TYPE) return null;
  // Atlas's store writes through immer, which its declared type leaves out: a recipe handed to `setState` is one write.
  const view: Omit<MapView, 'atlasStore'> & { readonly atlasStore: Pick<ViewAtlasStore, 'getState' | 'subscribe' | 'setState'> } = leaf.view as AtlasView;
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

/** The ids of the tokens selected in a scene, in the order they were selected. */
export function selectedTokenIds(state: SceneState & Partial<Pick<ViewState, 'selectedIds'>>): string[] {
  return (state.selectedIds ?? []).filter((id) => Object.hasOwn(state.objects.tokens, id));
}

/** What the GM calls a token: a character's name, else its artwork's file name. */
export function tokenLabel(token: TokenEntity): string {
  const name = token.kind === 'character' ? (token.name || token.statblockName) ?? '' : '';
  if (name.trim() !== '') return name.trim();
  const file = token.imagePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
  return file === '' ? 'Unnamed token' : file;
}

/** An Atlas tab's store and the map path its player tokens are kept by. */
export interface WorkScene {
  readonly store: SceneStore;
  readonly mapPath: string;
}

/** The store of the active Atlas tab, or null while none is active. */
export function activeStore(app: App): SceneStore | null {
  const leaf = activeAtlasLeaf(app);
  return leaf === null ? null : sceneStoreOf(leaf);
}

/** A store with its map path, or null while it shows no map. */
export function workScene(store: SceneStore | null): WorkScene | null {
  const mapPath = store?.getState().mapPath ?? null;
  return store === null || mapPath === null ? null : { store, mapPath };
}
