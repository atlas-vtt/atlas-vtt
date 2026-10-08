import { App, Notice } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { LocalPlayerView } from '../local-player-view';
import { AtlasView, ATLAS_VIEW_TYPE } from '../atlas-view';
import type { ViewAtlasState } from '../storeFactory';
import { playerWindowStore } from '../stores/playerWindowStore';
import type { SceneTab } from '../types/sceneTabTypes';
import { t } from '../i18n';
import type { PlayerFrameSource } from './PlayerFrameMirror';
import { PlayerWindowService } from './PlayerWindowService';
import { rendersOnChange, requestRender, setBeforeRender } from '../pixi/RenderScheduler';

/** Unsubscribes the tab watcher of the view whose tab is currently presented. */
let stopWatchingPresentedTab: (() => void) | null = null;
/** The view whose presented tab is being watched. */
let watchedView: AtlasView | null = null;

/** Present the active view's current scene tab, opening the player window if needed. */
export async function presentActiveTabInPlayerWindow(app: App): Promise<void> {
  const view = app.workspace.getActiveViewOfType(AtlasView);
  const activeTabId = view?.tabMetaStore.getState().activeTabId ?? null;
  if (!view || !activeTabId) {
    new Notice(t('present.noMap'));
    return;
  }
  await presentTabInPlayerWindow(app, view, activeTabId);
}

/**
 * Switch `view` to the scene tab `tabId`, wait until it is rendered, then show it
 * to players. Opens the player window when it is not open yet. From then on the
 * player window keeps showing this tab while the DM browses other tabs.
 */
export async function presentTabInPlayerWindow(app: App, view: AtlasView, tabId: string): Promise<void> {
  const tab = findTab(view, tabId);
  if (!tab) return;

  await view.switchToTab(tabId);
  if (view.tabMetaStore.getState().activeTabId !== tabId) return;

  const source = await waitForRenderedFrameSource(view);
  if (!source) {
    new Notice(t('present.noCanvas'));
    return;
  }

  const service =
    PlayerWindowService.getInstance() ??
    new PlayerWindowService(app, view.atlasStore, view.serviceManager.getSettingsService());
  if (service.isWindowOpen()) {
    service.presentCanvas(source, tabId, tab.filePath);
  } else {
    await service.openPlayerWindow(source, tabId, tab.filePath);
  }
  watchPresentedTab(view, service);
  new Notice(t('present.shows', { name: tab.displayName }));
}

/** Reconnect a restored workspace leaf without opening another popout. */
export async function restorePlayerWindow(app: App, player: LocalPlayerView): Promise<void> {
  if (player.isClosed || PlayerWindowService.getInstance()?.ownsView(player)) return;
  const session = player.getState();
  const leaves = app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE);
  // Prefer the exact scene tab; fall back to its path if tab IDs changed.
  let sourceView: AtlasView | undefined;
  let sourceTab: SceneTab | undefined;
  for (const leaf of leaves) {
    // revealLeaf also loads deferred views on supported Obsidian versions.
    if (!(leaf.view instanceof AtlasView)) await app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof AtlasView)) continue;
    const tabs = leaf.view.tabMetaStore.getState().tabs;
    const tab = tabs.find((entry) => entry.id === session.tabId) ?? tabs.find((entry) => entry.filePath === session.filePath);
    if (tab) { sourceView = leaf.view; sourceTab = tab; break; }
  }
  if (!sourceView || !sourceTab) {
    player.contentEl.setText(t('present.reconnect'));
    return;
  }
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
  const service = PlayerWindowService.getInstance() ?? new PlayerWindowService(
    app, sourceView.atlasStore, sourceView.serviceManager.getSettingsService(),
  );
  const viewport = sourceView.serviceManager.getRendererService().getViewport();
  // A frozen camera is rendered on its own, so only a live presentation moves the DM viewport.
  if (session.camera && viewport && !session.frozen) {
    viewport.setZoom(session.camera.scale);
    viewport.moveCenter(session.camera.centerX, session.camera.centerY);
  }
  // Freeze before attaching so the first mirrored frame already uses the saved camera.
  if (session.frozen) service.freezeCamera(session.camera ?? source.getCamera?.());
  service.attachToView(player, source, sourceTab.id);
  watchPresentedTab(sourceView, service);
  if (previousTabId && previousTabId !== sourceTab.id) await sourceView.switchToTab(previousTabId);
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
    if (!state.presentedTabId) stopWatchingPresentedTab?.();
  });
  // Leaving the presented tab is known at once, before the canvas changes
  const stopWatchingTabs = view.tabMetaStore.subscribe((state, previous) => {
    if (state.activeTabId === previous.activeTabId) return;
    const { presentedTabId } = playerWindowStore.getState();
    if (presentedTabId && state.activeTabId !== presentedTabId) service.holdCurrentFrame();
  });
  // Coming back is not: the tab is active before its scene starts loading, and a retry after
  // a failed load changes no tab. Players see the scene again once the store holds it as loaded.
  const stopWatchingScene = view.atlasStore.subscribe((state, previous) => {
    const { presentedTabId } = playerWindowStore.getState();
    if (!presentedTabId || !showsScene(state) || showsScene(previous)) return;
    if (state.mapPath === findTab(view, presentedTabId)?.filePath) void resumePresentedTab(view, service, presentedTabId);
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
    canvas,
    store: view.atlasStore,
    diceEvents: view.serviceManager.getEventBus(),
    ...(mapPath ? {
      rollSources: { viewId: view.viewId, mapPath, shownTokens: (tokenIds) => renderer.playerRollTokens(mapPath, tokenIds) },
    } : {}),
    withPlayerSafeFrame: (capture, settings, camera) => renderer.withPlayerSafeFrame(capture, settings, camera),
    ...(rendersOnChange(app) ? {
      beforeRender: {
        listen: (listener) => setBeforeRender(app, listener),
        requestRender: () => requestRender(app),
        withPlayerSafeFrame: (capture, settings, camera) => renderer.withPlayerSafeFrame(capture, settings, camera, true),
      },
    } : {}),
    getCamera: () => {
      const viewport = view.serviceManager.getRendererService().getViewport();
      return viewport ? { centerX: viewport.center.x, centerY: viewport.center.y, scale: viewport.scale.x } : undefined;
    },
    getScreen: () => {
      const viewport = view.serviceManager.getRendererService().getViewport();
      return viewport ? { width: viewport.screenWidth, height: viewport.screenHeight, resolution: app.renderer.resolution } : undefined;
    },
  };
}

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
