import { App, View } from 'obsidian';
import { Ticker } from 'pixi.js';
import type { StoreApi } from 'zustand';
import type { LocalPlayerView, PlayerCameraState } from '../local-player-view';
import type { AtlasView } from '../atlas-view';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';
import type { ViewAtlasState } from '../storeFactory';
import { playerWindowStore } from '../stores/playerWindowStore';
import type { SceneTab } from '../types/sceneTabTypes';
import { t, tPlatform } from '../i18n';
import type { PlayerFrameSource } from './PlayerFrameMirror';
import { viewportCamera } from './playerFrame';
import { PlayerWindowService } from './PlayerWindowService';
import { presentedSceneOf, readPresentedScene, type PresentedScene, type PresentedSceneStore } from './presentedScene';
import { rendersOnChange, requestRender, setBeforeRender } from '../pixi/RenderScheduler';
import { TickerRelay } from '../pixi/tickerRelay';
import { showNotice } from '../ui/notice';
import { hasLevels, levelById, resolveLevel, viewedLevelId } from '../levels/sceneLevels';
import { levelLabel } from '../react/components/levels/levelEditing';
import { showsPresentedLevel } from './presentedLevel';
import { MapController } from '../MapController';
import { presentedTabIn, standingOf, trackPresentedScene, type TrackedSources } from './presentedSceneTracker';
import { runInBackground } from '../utils/backgroundTask';
import { isDesktopApp } from '../platform/desktopOnly';
import { playerOverlaySources } from './playerOverlaySources';

/** Unsubscribes the tab watcher of the view whose tab is currently presented. */
let stopWatchingPresentedTab: (() => void) | null = null;
/** The view whose presented tab is being watched. */
let watchedView: AtlasView | null = null;

/** How a presented scene reaches players. */
export interface PresentOptions {
  /** Open the player window on this device even where another plugin shows players the scene (`showElsewhere`). */
  openWindow?: boolean;
  /** Freeze players on this camera instead of following the DM's (Frame player view). */
  camera?: PlayerCameraState;
  /** Show this level of the scene (the tab shows it first); without one, the level the tab shows. */
  levelId?: string;
}

/** Present the active view's current scene tab to players. */
export async function presentActiveTab(app: App, options: PresentOptions = {}): Promise<void> {
  const active = app.workspace.getActiveViewOfType(View);
  const view = isAtlasView(active) ? active : null;
  const activeTabId = view?.tabMetaStore.getState().activeTabId ?? null;
  if (!view || !activeTabId) {
    showNotice(t('present.noMap'));
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
export async function presentTab(app: App, view: AtlasView, tabId: string, { openWindow = false, camera, levelId }: PresentOptions = {}): Promise<void> {
  const tab = findTab(view, tabId);
  if (!tab) return;

  await view.switchToTab(tabId);
  if (view.tabMetaStore.getState().activeTabId !== tabId) return;
  if (levelId !== undefined) view.atlasStore.getState().setViewedLevel(levelId);

  const source = await waitForRenderedFrameSource(view);
  if (!source) {
    showNotice(t('present.noCanvas'));
    return;
  }

  const presented = presentedSceneOf(app);
  const level = viewedLevelId(view.atlasStore.getState());
  presented.set({ tabId, filePath: tab.filePath, ...(level ? { levelId: level } : {}) });
  const service = PlayerWindowService.getInstance();
  if (service?.isWindowOpen()) {
    service.presentCanvas(source, tabId, tab.filePath, camera);
    watchPresentedTab(view, service);
  } else {
    // A window still waiting for its scene (restored, but its scene was not open) takes this one
    const waiting = PlayerWindowService.openPlayerView(app);
    if (waiting) await restorePlayerWindow(app, waiting);
    // Players who see the scene nowhere get the player window, and so does a GM who asks for it
    else if (openWindow || !presented.isShownElsewhere()) await showOnThisDevice(app, view);
  }
  const notice = presentedNotice(presented);
  // On mobile a scene nobody is shown elsewhere is shown on the device itself, in Table mode: there is nothing to announce
  if (notice === 'present.shownElsewhere') showNotice(tPlatform(notice, { name: presentedName(view, tab) }));
  else if (isDesktopApp()) showNotice(t(notice, { name: presentedName(view, tab) }));
}

/**
 * Shows players the presented scene on this device: in the player window, which only the desktop
 * app has; on mobile the view that holds the scene becomes their picture itself (Table mode).
 */
async function showOnThisDevice(app: App, view: AtlasView): Promise<void> {
  if (isDesktopApp()) await openPlayerWindow(app);
  else view.atlasStore.getState().enterTableMode();
}

/** What players were shown, as a notice names it: the scene, and the level of a scene with several. */
function presentedName(view: AtlasView, tab: SceneTab): string {
  const state = view.atlasStore.getState();
  const level = hasLevels(state.levels) ? levelById(state.levels, viewedLevelId(state)) : null;
  return level && state.levels ? t('present.sceneLevel', { scene: tab.displayName, level: levelLabel(state.levels, level) }) : tab.displayName;
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
  // Mobile has no second window: the scene stays presented, for whoever shows it elsewhere
  if (!isDesktopApp()) return;
  if (PlayerWindowService.getInstance()?.isWindowOpen()) {
    showNotice(t('lpv.alreadyOpen'));
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
  if (!isDesktopApp() || player.isClosed || attaching.has(player) || PlayerWindowService.getInstance()?.ownsView(player)) return;
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
  // The presented level, else the first: the tab shows it, as players will
  const sourceState = sourceView.atlasStore.getState();
  if (hasLevels(sourceState.levels)) sourceState.setViewedLevel(resolveLevel(sourceState.levels, scene?.levelId));
  const source = await waitForRenderedFrameSource(sourceView);
  if (!source || player.isClosed) return;
  // The tab the scene was found in is the presented one from now on, also where its id was made anew
  const level = viewedLevelId(sourceView.atlasStore.getState());
  presented.set({ tabId: sourceTab.id, filePath: sourceTab.filePath, ...(level ? { levelId: level } : {}) });
  const service = PlayerWindowService.getInstance() ?? new PlayerWindowService(
    app, sourceView.atlasStore, sourceView.serviceManager.getSettingsService(),
  );
  // The window's camera belongs to the scene and level it showed; another starts on the DM's camera
  const sameScene = (session.tabId === sourceTab.id || session.filePath === sourceTab.filePath) && (session.levelId ?? null) === level;
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
  service.attachToView(player, source, { tabId: sourceTab.id, filePath: sourceTab.filePath, ...(level ? { levelId: level } : {}) });
  watchPresentedTab(sourceView, service);
  if (previousTabId && previousTabId !== sourceTab.id) await sourceView.switchToTab(previousTabId);
}

/**
 * The open Atlas tab of `scene` (`presentedTabIn`). Leaves Obsidian has not loaded yet are revealed, which loads
 * them, one by one until a view has the scene's tab id.
 */
async function findOpenTab(app: App, scene: PresentedScene): Promise<{ view: AtlasView; tab: SceneTab } | null> {
  const views: AtlasView[] = [];
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    // revealLeaf also loads deferred views on supported Obsidian versions.
    if (!isAtlasView(leaf.view)) await app.workspace.revealLeaf(leaf);
    if (!isAtlasView(leaf.view)) continue;
    views.push(leaf.view);
    if (leaf.view.tabMetaStore.getState().tabs.some(({ id }) => id === scene.tabId)) break;
  }
  const found = presentedTabIn(tabbed(views), scene);
  return found && { view: found.view.view, tab: found.tab };
}

/** Atlas views as the presented scene is found among them. */
const tabbed = (views: readonly AtlasView[]): { view: AtlasView; tabs: readonly SceneTab[]; isPlayerView: boolean }[] =>
  views.map((view) => ({ view, tabs: view.tabMetaStore.getState().tabs, isPlayerView: view.atlasStore.getState().isPlayerView === true }));

/**
 * Makes `view` the player window's source again whenever it finishes loading the presented scene
 * while the window has lost the view it showed (that view closed). Returns the unsubscriber.
 */
export function followPresentedScene(app: App, view: AtlasView): () => void {
  return view.atlasStore.subscribe((state, previous) => {
    if (showsScene(state) && !showsScene(previous)) runInBackground(reconnectPresentedScene(app, view), 'Showing players the presented scene again');
  });
}

/**
 * Shows players the presented scene from `view` once it is drawn, if it still shows that scene and
 * no other view took its place. Their camera, freeze and level carry over, as when the DM returns to the presented tab.
 */
async function reconnectPresentedScene(app: App, view: AtlasView): Promise<void> {
  const tab = presentedTabShown(app, view);
  const service = PlayerWindowService.getInstance();
  if (!tab || !service?.awaitsSource()) return;
  if (playerWindowStore.getState().shownTabId === tab.id) {
    watchPresentedTab(view, service, true);
    return;
  }
  // The scene's tab id was made anew: that tab is the presented one from now on
  const source = await waitForRenderedFrameSource(view);
  const scene = presentedSceneOf(app).get();
  if (!source || !scene || presentedTabShown(app, view) !== tab || !service.awaitsSource()) return;
  presentedSceneOf(app).set({ ...scene, tabId: tab.id, filePath: tab.filePath });
  service.presentCanvas(source, tab.id, tab.filePath);
  watchPresentedTab(view, service);
}

/** The view's active tab when it is the presented scene's (`presentedTabIn`) and its map is loaded. */
function presentedTabShown(app: App, view: AtlasView): SceneTab | null {
  const found = presentedTabIn(tabbed([view]), presentedSceneOf(app).get());
  return found && standingOf(sceneOf(view), found.tab) === 'shown' ? found.tab : null;
}

/** The view's tabs and scene store, as the presented scene's standing reads them. */
const sceneOf = (view: AtlasView): TrackedSources => ({ tabs: view.tabMetaStore, store: view.atlasStore });

/** Views that already release the player window when they close. */
const viewsReleasingOnClose = new WeakSet<AtlasView>();

/** Follows the tab players are shown in `view`; with `resumeLive`, shows it to them live again once it is drawn. */
function watchPresentedTab(view: AtlasView, service: PlayerWindowService, resumeLive = false): void {
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
  const shownTab = (): SceneTab | null => {
    const { shownTabId } = playerWindowStore.getState();
    return shownTabId ? findTab(view, shownTabId) ?? null : null;
  };
  // Players see the tab shown on its level only: every change of the active tab away from it, and every change of
  // level off theirs, holds their frame at once, before the canvas changes, also where the tab or level shown before
  // was not theirs either; so does a tab that finishes loading on another level. A level whose map is replaced under
  // players keeps them live while the new image loads. A tab that loads keeps what it has. They see it live again as
  // it finishes loading, comes to their level, or its map image loads their level: nothing else shows a held frame.
  const tracker = trackPresentedScene({ ...sceneOf(view), level: levelOf(view) }, shownTab, ({ now, before, tabChanged, levelChanged, levelLoaded }) => {
    const moved = now !== before;
    if ((now === 'away' && (moved || tabChanged)) || (now === 'other-level' && (levelChanged || (moved && before !== 'shown')))) service.holdCurrentFrame();
    // A held window whose tab stands `shown` exists only while a resume is pending, so the image's load needs no flag
    // of its own: `resume` hands the source only to a window that does not show this view live.
    else if (now === 'shown' && (before === 'loading' || levelChanged || levelLoaded)) resume();
  });
  function resume(): void {
    void waitForRenderedFrameSource(view).then((source) => {
      // The DM may have moved on while the frames were drawn; a window still live on this view keeps its frame source
      if (source && tracker.standing === 'shown' && !service.mirrors(view.atlasStore)) service.releaseHeldFrame(source);
    });
  }
  stopWatchingPresentedTab = (): void => {
    tracker.stop();
    stopWatchingWindow();
    stopWatchingPresentedTab = null;
    watchedView = null;
  };
  if (resumeLive) resume();
}

/** Whether `view` shows players' level of the presented scene, which a level switch changes, and its map image loading that level's background. */
const levelOf = (view: AtlasView): NonNullable<TrackedSources['level']> => ({
  shows: () => showsPresentedLevel(view),
  viewed: () => viewedLevelId(view.atlasStore.getState()),
  follow: (listener) => MapController.onBackgroundLoaded((mapImage) => {
    if (mapImage === view.serviceManager.getRendererService().getRenderer()?.getMapImage()) listener();
  }),
});

/** Whether the store holds a scene completely: loaded, and its tokens drawn. */
function showsScene(state: ViewAtlasState): boolean {
  return state.mapLoaded && !state.isMapLoading;
}

function findTab(view: AtlasView, tabId: string): SceneTab | undefined {
  return view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId);
}

/** Resolve the view's frame source after the current scene load has finished and been drawn. */
async function waitForRenderedFrameSource(view: AtlasView): Promise<PlayerFrameSource | null> {
  await waitForMapLoaded(view.atlasStore);
  await nextAnimationFrames(2);
  return frameSourceOf(view);
}

/** The view's canvas as players would get it, or null while it shows no loaded scene. */
export function frameSourceOf(view: AtlasView): PlayerFrameSource | null {
  // A scene that failed to load leaves a canvas without fog and tokens; players must not see it
  if (!view.atlasStore.getState().mapLoaded) return null;
  const renderer = view.serviceManager.getRendererService().getRenderer();
  const app = renderer?.getAppInstance();
  const canvas = app?.canvas;
  if (!renderer || !app || !canvas?.instanceOf(HTMLCanvasElement)) return null;
  // The view's own ticker and the shared one its map image loads tesserae on
  const clocks = new TickerRelay([app.ticker, Ticker.shared]);
  return {
    store: view.atlasStore,
    ...playerOverlaySources(view, renderer),
    withPlayerSafeFrame: (copy, settings, frame) => renderer.withPlayerSafeFrame(copy, settings, frame),
    // Hex sizes are flat-to-flat, so true scale sizes a hex across its flats
    getGridSize: () => (view.atlasStore.getState().grid?.tableTvTrueScale === false ? undefined : renderer.getGridOptions()?.size),
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
    keepTime: (time) => clocks.frame(time),
    canRender: () => renderer.canRenderPlayerFrame() && showsPresentedLevel(view),
    release: () => renderer.releasePlayerFrame(),
    addDemandRegion: (region) => renderer.pictures.keepReady(region),
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
