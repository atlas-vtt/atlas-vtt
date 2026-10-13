import { App, Notice } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { LocalPlayerView } from '../local-player-view';
import { AtlasView, ATLAS_VIEW_TYPE } from '../atlas-view';
import type { ViewAtlasState } from '../storeFactory';
import { playerWindowStore } from '../stores/playerWindowStore';
import type { SceneTab } from '../types/sceneTabTypes';
import { t } from '../i18n';
import type { PlayerFrameSource } from './PlayerFrameMirror';
import { viewportCamera } from './playerFrame';
import { PlayerWindowService } from './PlayerWindowService';
import { presentedSceneOf, readPresentedScene, type PresentedScene, type PresentedSceneStore } from './presentedScene';
import { rendersOnChange, requestRender, setBeforeRender } from '../pixi/RenderScheduler';

/** Unsubscribes the tab watcher of the view whose tab is currently presented. */
let stopWatchingPresentedTab: (() => void) | null = null;
/** The view whose presented tab is being watched. */
let watchedView: AtlasView | null = null;

/** How a presented scene reaches players. */
export interface PresentOptions {
  /** Open the player window on this device even where another plugin shows players the scene (`showElsewhere`). */
  openWindow?: boolean;
}

/** Present the active view's current scene tab to players. */
export async function presentActiveTab(app: App, options: PresentOptions = {}): Promise<void> {
  const view = app.workspace.getActiveViewOfType(AtlasView);
  const activeTabId = view?.tabMetaStore.getState().activeTabId ?? null;
  if (!view || !activeTabId) {
    new Notice(t('present.noMap'));
    return;
  }
  await presentTab(app, view, activeTabId, options);
}

/**
 * Switch `view` to the scene tab `tabId`, wait until it is rendered, then make it the presented
 * scene and show it to players wherever they look: an open player window shows it at once and
 * keeps showing it while the DM browses other tabs, and so does a plugin that shows the presented
 * scene elsewhere (`showElsewhere`). With neither, or with `openWindow`, the player window is opened on it.
 */
export async function presentTab(app: App, view: AtlasView, tabId: string, { openWindow = false }: PresentOptions = {}): Promise<void> {
  const tab = findTab(view, tabId);
  if (!tab) return;

  await view.switchToTab(tabId);
  if (view.tabMetaStore.getState().activeTabId !== tabId) return;

  const source = await waitForRenderedFrameSource(view);
  if (!source) {
    new Notice(t('present.noCanvas'));
    return;
  }

  const presented = presentedSceneOf(app);
  presented.set({ tabId, filePath: tab.filePath });
  const service = PlayerWindowService.getInstance();
  if (service?.isWindowOpen()) {
    service.presentCanvas(source, tabId, tab.filePath);
    watchPresentedTab(view, service);
  } else {
    // A window still waiting for its scene (restored, but its scene was not open) takes this one
    const waiting = PlayerWindowService.openPlayerView(app);
    if (waiting) await restorePlayerWindow(app, waiting);
    // Players who see the scene nowhere get the player window, and so does a GM who asks for it
    else if (openWindow || !presented.isShownElsewhere()) await openPlayerWindow(app);
  }
  new Notice(t(presentedNotice(presented), { name: tab.displayName }));
}

/** What players were shown: the player window, only what another plugin shows, or nothing until the window opens. */
function presentedNotice(presented: PresentedSceneStore): 'present.shows' | 'present.shownElsewhere' | 'present.chosen' {
  if (PlayerWindowService.getInstance()?.isWindowOpen() ?? false) return 'present.shows';
  return presented.isShownElsewhere() ? 'present.shownElsewhere' : 'present.chosen';
}

/**
 * Open the player window on the presented scene. With nothing presented yet the active map is
 * presented first, so the window never opens on nothing when there is a map to show.
 */
export async function openPlayerWindow(app: App): Promise<void> {
  if (PlayerWindowService.getInstance()?.isWindowOpen()) {
    new Notice(t('lpv.alreadyOpen'));
    return;
  }
  const presented = presentedSceneOf(app);
  if (!presented.get()) await presentActiveTab(app);
  const scene = presented.get();
  if (!scene) return;
  const player = await PlayerWindowService.openLeaf(app, scene);
  if (player) await restorePlayerWindow(app, player);
}

/** Player views being attached now; Obsidian's own restore of the same leaf waits for none. */
const attaching = new WeakSet<LocalPlayerView>();

/**
 * Attach a player window leaf (restored with the workspace, or just opened) to the view that
 * holds the presented scene, without opening another popout. A window saved before the
 * presented scene was kept on its own brings its scene along.
 */
export async function restorePlayerWindow(app: App, player: LocalPlayerView): Promise<void> {
  if (player.isClosed || attaching.has(player) || PlayerWindowService.getInstance()?.ownsView(player)) return;
  attaching.add(player);
  try {
    await attachPlayerWindow(app, player);
  } finally {
    attaching.delete(player);
  }
}

async function attachPlayerWindow(app: App, player: LocalPlayerView): Promise<void> {
  const session = player.getState();
  const presented = presentedSceneOf(app);
  const scene = presented.get() ?? readPresentedScene(session);
  const found = scene ? await findOpenTab(app, scene) : null;
  if (!found) {
    player.contentEl.setText(t('present.reconnect'));
    return;
  }
  const { view: sourceView, tab: sourceTab } = found;
  const previousTabId = sourceView.tabMetaStore.getState().activeTabId;
  await waitForMapLoaded(sourceView.atlasStore);
  if (player.isClosed) return;
  await sourceView.switchToTab(sourceTab.id);
  if (sourceView.tabMetaStore.getState().activeTabId !== sourceTab.id) {
    player.contentEl.setText(t('present.loadFailed'));
    return;
  }
  const source = await waitForRenderedFrameSource(sourceView);
  if (!source || player.isClosed) return;
  // The tab the scene was found in is the presented one from now on, also where its id was made anew
  presented.set({ tabId: sourceTab.id, filePath: sourceTab.filePath });
  const service = PlayerWindowService.getInstance() ?? new PlayerWindowService(
    app, sourceView.atlasStore, sourceView.serviceManager.getSettingsService(),
  );
  // The window's camera belongs to the scene it showed; another scene starts on the DM's camera
  const sameScene = session.tabId === sourceTab.id || session.filePath === sourceTab.filePath;
  const viewport = sourceView.serviceManager.getRendererService().getViewport();
  // A frozen camera is rendered on its own, so only a live presentation moves the DM viewport.
  if (sameScene && session.camera && viewport && !session.frozen) {
    viewport.setZoom(session.camera.scale);
    viewport.moveCenter(session.camera.centerX, session.camera.centerY);
  }
  // Freeze before attaching so the first mirrored frame already uses the saved camera.
  if (sameScene && session.frozen) service.freezeCamera(session.camera ?? source.getCamera?.());
  // Saved for another scene, the camera and the freeze say nothing about this one
  if (!sameScene) player.updateSession({ camera: null, frozen: false });
  service.attachToView(player, source, { tabId: sourceTab.id, filePath: sourceTab.filePath });
  watchPresentedTab(sourceView, service);
  if (previousTabId && previousTabId !== sourceTab.id) await sourceView.switchToTab(previousTabId);
}

/** The open Atlas tab of `scene`: the tab with its id, else (tab ids made anew) the first tab of its file. */
async function findOpenTab(app: App, scene: PresentedScene): Promise<{ view: AtlasView; tab: SceneTab } | null> {
  let byFile: { view: AtlasView; tab: SceneTab } | null = null;
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    // revealLeaf also loads deferred views on supported Obsidian versions.
    if (!(leaf.view instanceof AtlasView)) await app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof AtlasView)) continue;
    for (const tab of leaf.view.tabMetaStore.getState().tabs) {
      if (tab.id === scene.tabId) return { view: leaf.view, tab };
      if (!byFile && tab.filePath === scene.filePath) byFile = { view: leaf.view, tab };
    }
  }
  return byFile;
}

/** Views that already release the player window when they close. */
const viewsReleasingOnClose = new WeakSet<AtlasView>();

function watchPresentedTab(view: AtlasView, service: PlayerWindowService): void {
  stopWatchingPresentedTab?.();
  if (!viewsReleasingOnClose.has(view)) {
    viewsReleasingOnClose.add(view);
    // Closing the presented map must not leave its renderer and store reachable from the player window
    view.register(() => {
      if (watchedView === view) stopWatchingPresentedTab?.();
      PlayerWindowService.getInstance()?.releaseSource(view.atlasStore);
    });
  }
  watchedView = view;
  // Release the view once the player window closes, otherwise this closure keeps a closed view alive.
  const stopWatchingWindow = playerWindowStore.subscribe((state) => {
    if (!state.shownTabId) stopWatchingPresentedTab?.();
  });
  // Leaving the presented tab is known at once, before the canvas changes
  const stopWatchingTabs = view.tabMetaStore.subscribe((state, previous) => {
    if (state.activeTabId === previous.activeTabId) return;
    const { shownTabId } = playerWindowStore.getState();
    if (shownTabId && state.activeTabId !== shownTabId) service.holdCurrentFrame();
  });
  // Coming back is not: the tab is active before its scene starts loading, and a retry after
  // a failed load changes no tab. Players see the scene again once the store holds it as loaded.
  const stopWatchingScene = view.atlasStore.subscribe((state, previous) => {
    const { shownTabId } = playerWindowStore.getState();
    if (!shownTabId || !showsScene(state) || showsScene(previous)) return;
    if (state.mapPath === findTab(view, shownTabId)?.filePath) void resumePresentedTab(view, service, shownTabId);
  });
  stopWatchingPresentedTab = (): void => {
    stopWatchingTabs();
    stopWatchingScene();
    stopWatchingWindow();
    stopWatchingPresentedTab = null;
    watchedView = null;
  };
}

/** Whether the store holds a scene completely: loaded, and its tokens drawn. */
function showsScene(state: ViewAtlasState): boolean {
  return state.mapLoaded && !state.isMapLoading;
}

async function resumePresentedTab(view: AtlasView, service: PlayerWindowService, tabId: string): Promise<void> {
  const source = await waitForRenderedFrameSource(view);
  const state = view.atlasStore.getState();
  // The DM may have moved on while the frames were drawn
  if (!source || !showsScene(state) || state.mapPath !== findTab(view, tabId)?.filePath) return;
  service.releaseHeldFrame(source);
}

function findTab(view: AtlasView, tabId: string): SceneTab | undefined {
  return view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId);
}

/** Resolve the view's frame source after the current scene load has finished and been drawn. */
async function waitForRenderedFrameSource(view: AtlasView): Promise<PlayerFrameSource | null> {
  await waitForMapLoaded(view.atlasStore);
  await nextAnimationFrames(2);
  // A scene that failed to load leaves a canvas without fog and tokens; players must not see it
  if (!view.atlasStore.getState().mapLoaded) return null;
  const renderer = view.serviceManager.getRendererService().getRenderer();
  const app = renderer?.getAppInstance();
  const canvas = app?.canvas;
  if (!renderer || !app || !canvas?.instanceOf(HTMLCanvasElement)) return null;
  // The scene rendered now: rolls are named by what its players' frame shows, never by a later scene
  const mapPath = view.atlasStore.getState().mapPath;
  return {
    store: view.atlasStore,
    diceEvents: view.serviceManager.getEventBus(),
    ...(mapPath ? {
      rollSources: { viewId: view.viewId, mapPath, shownTokens: (tokenIds) => renderer.playerRollTokens(mapPath, tokenIds) },
    } : {}),
    withPlayerSafeFrame: (copy, settings, frame) => renderer.withPlayerSafeFrame(copy, settings, frame),
    ...(rendersOnChange(app) ? {
      beforeRender: {
        listen: (listener) => setBeforeRender(app, listener),
        requestRender: () => requestRender(app),
        withPlayerSafeFrame: (copy, settings, frame) => renderer.withPlayerSafeFrame(copy, settings, frame, true),
      },
    } : {}),
    getCamera: () => {
      const viewport = view.serviceManager.getRendererService().getViewport();
      return viewport ? viewportCamera(viewport) : undefined;
    },
    getScreen: () => {
      const viewport = view.serviceManager.getRendererService().getViewport();
      return viewport ? { width: viewport.screenWidth, height: viewport.screenHeight, resolution: app.renderer.resolution } : undefined;
    },
    canRender: () => renderer.canRenderPlayerFrame(),
    release: () => renderer.releasePlayerFrame(),
    addDemandRegion: (region) => renderer.getMapImage()?.addDemandRegion(region) ?? noRegion,
  };
}

function noRegion(): void {}

function waitForMapLoaded(store: StoreApi<ViewAtlasState>): Promise<void> {
  if (!store.getState().isMapLoading) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.subscribe((state) => {
      if (state.isMapLoading) return;
      unsubscribe();
      resolve();
    });
  });
}

function nextAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining === 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}
