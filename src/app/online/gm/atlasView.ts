import type { App, WorkspaceLeaf } from 'obsidian';
import type { ShownRollToken } from '../../services/playerRollSource';
import type { TokenEntity } from '../../types';
import type { ViewState } from '../../types/viewState';
import type { TokenRules } from './tokenUI.ts';

/** The view type of Atlas's map tabs; a test holds it to the vendor's `ATLAS_VIEW_TYPE`. */
export const ATLAS_VIEW_TYPE = 'atlas-vtt';
/** The view type of Atlas's local player window; a test holds it to the vendor's `LOCAL_PLAYER_VIEW_TYPE`. */
export const LOCAL_PLAYER_VIEW_TYPE = 'atlas-vtt-local-player';

/** The part of an Atlas map tab's store the companion reads. */
export type SceneState = Pick<ViewState, 'mapPath' | 'mapLoaded' | 'isMapLoading' | 'background' | 'lighting' | 'objects' | 'grid' | 'heldTokens' | 'exploredMask' | 'isDragging' | '_audioDirty'>
  & Partial<Pick<ViewState, 'tokenSettings' | 'fogHeld'>>;

/**
 * What the companion asks of an Atlas tab's renderer (`PixiRendererOrchestrator`): the tokens the
 * players' frame of a scene shows (not hidden, seen, not under fog) and the grid they are sized by.
 */
export interface PlayerTokenSource {
  playerRollTokens(mapPath: string, tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken>;
  getGridOptions(): { readonly size: number } | null;
}

/** An Atlas map tab's store, as far as the companion uses it. */
export interface SceneStore {
  getState(): SceneState;
  /** A write through Atlas's own middleware (immer and history): one undo step. */
  setState(recipe: (draft: SceneState) => void): void;
  subscribe(listener: (state: SceneState) => void): () => void;
}

/** Atlas's store is zustand's `create` result: a function with the store methods on it. */
function isStore(value: unknown): value is SceneStore {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && 'getState' in value && typeof value.getState === 'function' && 'subscribe' in value && typeof value.subscribe === 'function'
    && 'setState' in value && typeof value.setState === 'function';
}

function isTokenSource(value: unknown): value is PlayerTokenSource {
  return typeof value === 'object' && value !== null && 'playerRollTokens' in value && typeof value.playerRollTokens === 'function'
    && 'getGridOptions' in value && typeof value.getGridOptions === 'function';
}

/** Calls a method of an object by name when it has one, else gives undefined. */
export function call(target: unknown, method: string): unknown {
  if (typeof target !== 'object' || target === null || !(method in target)) return undefined;
  const fn: unknown = (target as Record<string, unknown>)[method];
  return typeof fn === 'function' ? (fn as () => unknown).call(target) : undefined;
}

/** A renderer (`view.serviceManager.getRendererService().getRenderer()`) as the players' token source, or null when it is none. */
export function asTokenSource(renderer: unknown): PlayerTokenSource | null {
  return isTokenSource(renderer) ? renderer : null;
}

/** The renderer of an Atlas map tab as it is now, unchecked. */
export function rendererOf(leaf: WorkspaceLeaf): unknown {
  const view: unknown = leaf.view;
  const services = typeof view === 'object' && view !== null && 'serviceManager' in view ? view.serviceManager : undefined;
  return call(call(services, 'getRendererService'), 'getRenderer');
}

/** The store of an Atlas map tab, or null for any other leaf. */
export function sceneStoreOf(leaf: WorkspaceLeaf): SceneStore | null {
  const view: unknown = leaf.view;
  if (leaf.view.getViewType() !== ATLAS_VIEW_TYPE || typeof view !== 'object' || view === null || !('atlasStore' in view)) return null;
  return isStore(view.atlasStore) ? view.atlasStore : null;
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

/**
 * The resource and condition definitions the tab's token renderer draws by (its collection sync, one
 * private hop: `getTokenRenderer().collectionSync`), or null while they cannot be read (another Atlas
 * version, no renderer, a failing read): then players get no bars and no condition badges.
 */
export function tokenRulesOf(renderer: unknown): TokenRules | null {
  const tokens = call(renderer, 'getTokenRenderer');
  const sync: unknown = typeof tokens === 'object' && tokens !== null && 'collectionSync' in tokens ? tokens.collectionSync : undefined;
  try {
    const resources = call(sync, 'resources');
    const conditions = call(sync, 'conditions');
    const records = (list: unknown): boolean => Array.isArray(list) && list.every((entry) => typeof entry === 'object' && entry !== null);
    return records(resources) && records(conditions) ? { resources: resources as TokenRules['resources'], conditions: conditions as TokenRules['conditions'] } : null;
  } catch {
    return null;
  }
}

/**
 * Where the tab's token renderer draws each of these tokens now (`getTokenRenderer().getTokenSprites()`):
 * during the GM's own drag Atlas moves the sprites with every pointer move but writes the store only
 * every 50 ms. Tokens without a sprite, or with a place that is no number, are left out; empty while
 * the renderer cannot be read.
 */
export function drawnTokenPlaces(renderer: unknown, tokenIds: readonly string[]): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const places = new Map<string, { readonly x: number; readonly y: number }>();
  const sprites = call(call(renderer, 'getTokenRenderer'), 'getTokenSprites');
  if (typeof sprites !== 'object' || sprites === null) return places;
  for (const id of tokenIds) {
    const sprite: unknown = Object.hasOwn(sprites, id) ? (sprites as Record<string, unknown>)[id] : undefined;
    const position: unknown = typeof sprite === 'object' && sprite !== null && 'position' in sprite ? sprite.position : undefined;
    if (typeof position !== 'object' || position === null || !('x' in position) || !('y' in position)) continue;
    const { x, y } = position;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) places.set(id, { x, y });
  }
  return places;
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
