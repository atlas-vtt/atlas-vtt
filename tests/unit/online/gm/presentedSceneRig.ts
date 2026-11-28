import { createHash } from 'node:crypto';
import type { App, WorkspaceLeaf } from 'obsidian';
import type { AtlasView } from '../../../../src/app/atlas-view';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { MapCanvas } from '../../../../src/app/online/gm/mapView.ts';
import { followPresentedScene } from '../../../../src/app/services/PlayerWindowPresenter';
import { createTabMetaStore, type TabMetaStore } from '../../../../src/app/stores/tabMetaStore';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { EventEmitter } from '../../../../src/app/utils/typedEmitter';
import { app, png, workspace } from './fakeTable.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import type { PlayerPages } from './playerPages.ts';
import { sceneState } from './shareHarness.ts';

/*
 * Atlas map views as both readers of the presented scene take them: the player window's presenter (an `AtlasView`:
 * its tab and scene stores, renderer service, `switchToTab`, `register`) and the running table (a `MapView`). Each
 * view loads a scene the way Atlas does: the tab first, then the store loading, then the scene loaded.
 */

export const CAVE = 'Scenes/Cave.atlasmap';
export const HALL = 'Scenes/Hall.atlasmap';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/cave.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png' },
];

/** A view's scene store: the scene a table reads, the levels the presenter reads, and the level switch. */
export type RigState = SceneState & { levels?: SceneLevel[]; viewedLevel?: string; setViewedLevel(levelId: string): void };

/** The vault's images, as the table reads them. */
export const FILES: ReadonlyMap<string, Uint8Array> = new Map([['maps/cave.png', png(70, 70)], ['maps/upper.png', png(35, 35)], ['maps/hall.png', png(140, 140)]]);

const loaded = (file: string): SceneState => (file === CAVE
  ? { ...sceneState({ mapPath: CAVE, background: 'maps/cave.png' }), levels: LEVELS, viewedLevel: 'ground' } as SceneState
  : { ...sceneState({ mapPath: file, background: 'maps/hall.png' }), levels: undefined, viewedLevel: undefined } as SceneState);

export interface RigView {
  readonly name: string;
  /** The map view itself, as Atlas's presenter takes it. */
  readonly view: AtlasView;
  readonly leaf: WorkspaceLeaf;
  readonly store: StoreApi<RigState>;
  readonly tabs: TabMetaStore;
  /** The id of the view's tab of `file`. */
  tabOf(file: string): string;
  /** The GM opens the view's tab of `file`, as a click on it does. */
  open(file: string): Promise<void>;
  /** Holds the next scene load until `finishLoad`: Atlas still loads it. */
  loadSlowly(): void;
  finishLoad(): void;
}

const views = new Map<unknown, RigView>();
/** What each view runs as it closes: `AtlasView.onClose` stops following, then what it registered runs. */
const closers = new Map<RigView, { readonly stopFollowing: () => void; readonly registered: (() => void)[] }>();

/** The view that owns `store`, by name. */
export const viewNamed = (store: unknown): string => [...views.values()].find((view) => view.store === store)?.name ?? '?';

/** A tab by its view and file: `v1 Cave`. */
export function tabNamed(tabId: string): string {
  for (const view of views.values()) {
    const tab = view.tabs.getState().tabs.find(({ id }) => id === tabId);
    if (tab !== undefined) return `${view.name}:${tab.filePath.split('/').pop()?.replace('.atlasmap', '')}`;
  }
  return 'a tab no view has';
}

function mapView(name: string, files: readonly string[], active: string, leaf: { view: unknown }): RigView {
  const tabs = createTabMetaStore();
  for (const file of files) tabs.getState().addTab(file, file);
  // A view opens loading its scene, as Atlas's does; `load` below finishes it once the view follows the presented scene.
  const store: StoreApi<RigState> = createStore<RigState>()(() => ({ ...loaded(active), mapLoaded: false, isMapLoading: true, setViewedLevel: (levelId: string) => store.setState({ viewedLevel: levelId }) }));
  let slow = false;
  /** A slow load under way: it ends loaded, or not at all where another load took its place. */
  let pending: { end(loads: boolean): void } | null = null;
  const tabOf = (file: string): string => tabs.getState().tabs.find(({ filePath }) => filePath === file)?.id ?? 'none';
  tabs.getState().setActiveTab(tabOf(active));
  const canvas = fakeTokenSource(() => store.getState(), () => undefined, () => 70);
  const renderer: MapCanvas & Record<string, unknown> = Object.assign(canvas, {
    getAppInstance: () => ({ canvas: document.createElement('canvas') }),
    withPlayerSafeFrame: (copy: () => void) => copy(),
    playerBadgeNumbers: () => null,
    canRenderPlayerFrame: () => true,
    releasePlayerFrame: () => undefined,
    getMapImage: () => null,
  });
  const events = new EventEmitter();
  const own: (() => void)[] = [];
  const view = {
    app, viewId: name, isViewClosing: false, containerEl: { ownerDocument: document },
    tabMetaStore: tabs, atlasStore: store, renderer,
    serviceManager: {
      getRendererService: () => ({ getRenderer: () => renderer, getViewport: () => undefined }),
      getEventBus: () => events, getAssetService: () => null, getToolController: () => null,
    },
    getViewType: () => 'atlas-vtt',
    isClosing(): boolean {
      return this.isViewClosing;
    },
    register: (close: () => void) => void own.push(close),
    switchToTab: async (tabId: string): Promise<void> => {
      const tab = tabs.getState().tabs.find(({ id }) => id === tabId);
      const state = store.getState();
      if (tab === undefined || (tabs.getState().activeTabId === tabId && ((state.mapLoaded && state.mapPath === tab.filePath) || state.isMapLoading))) return;
      pending?.end(false);
      tabs.getState().setActiveTab(tabId);
      store.setState({ isMapLoading: true });
      if (slow) {
        slow = false;
        const loads = await new Promise<boolean>((end) => { pending = { end }; });
        pending = null;
        if (!loads) return;
      }
      store.setState(loaded(tab.filePath));
    },
  };
  leaf.view = view;
  const rig: RigView = {
    name, view: view as unknown as AtlasView, leaf: leaf as unknown as WorkspaceLeaf, store, tabs, tabOf,
    open: (file) => view.switchToTab(tabOf(file)),
    loadSlowly: () => { slow = true; },
    finishLoad: () => pending?.end(true),
  };
  views.set(store, rig);
  // As `AtlasView.onOpen` does.
  closers.set(rig, { stopFollowing: followPresentedScene(app, view as never), registered: own });
  store.setState(loaded(active));
  return rig;
}

/** Opens a map view with a tab of each file, `active` shown and loaded. */
export function openView(name: string, files: readonly string[], active: string): RigView {
  const leaf = { view: null as unknown };
  const view = mapView(name, files, active, leaf);
  workspace.leaves = [...workspace.leaves, view.leaf];
  return view;
}

/** A map view Obsidian has not loaded yet: its placeholder has the view type and nothing else; revealing it loads it. */
export function deferredView(name: string, files: readonly string[], active: string): { leaf: WorkspaceLeaf; reveal(): RigView } {
  const leaf = { view: { getViewType: () => 'atlas-vtt' } as unknown };
  workspace.leaves = [...workspace.leaves, leaf as unknown as WorkspaceLeaf];
  return { leaf: leaf as unknown as WorkspaceLeaf, reveal: () => mapView(name, files, active, leaf) };
}

/** The view closes: Obsidian takes its leaf away, and the view runs what it registered and stops following. */
export function closeView(view: RigView): void {
  workspace.leaves = workspace.leaves.filter((leaf) => leaf !== view.leaf);
  (view.leaf.view as { isViewClosing: boolean }).isViewClosing = true;
  const closing = closers.get(view);
  closing?.stopFollowing();
  for (const close of closing?.registered ?? []) close();
  closers.delete(view);
  views.delete(view.store);
}

/** Forgets every view of the last test. */
export function resetViews(): void {
  for (const view of [...views.values()]) closeView(view);
  workspace.leaves = [];
}

/** The fake app, which reveals deferred leaves as Obsidian does. */
export function rigApp(reveal: (leaf: WorkspaceLeaf) => void): App {
  Object.assign(app.workspace, { revealLeaf: (leaf: WorkspaceLeaf) => Promise.resolve(reveal(leaf)), getActiveViewOfType: () => null });
  return app;
}

/** What a page read since `mark`: the scenes it was sent (by their map's file), else the kinds of what it read, or nothing. */
export function tableSent(pages: PlayerPages, player: string, mark: ReturnType<PlayerPages['mark']>): string {
  const files = new Map([...FILES].map(([path, bytes]) => [createHash('sha256').update(bytes).digest('hex'), path]));
  // How far an image's upload has come is no part of what players are shown.
  const read = pages.of(player).since(mark).filter(({ t }) => t !== 'asset-progress');
  const scenes = read.flatMap((body) => (body.t === 'scene' ? [body.scene === null ? 'scene none' : `scene ${files.get(body.scene.map?.hash ?? '') ?? 'of another map'}`] : []));
  if (scenes.length > 0) return scenes.join(', ');
  return read.length > 0 ? [...new Set(read.map(({ t }) => t))].sort().join(' ') : 'nothing';
}
