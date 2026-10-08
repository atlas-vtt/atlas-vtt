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
import { presentedScene, showsTab, whenMapLoaded } from './PresentedScene';
import { presentationTargetsRegistered, subscribePresentationTargets } from './presentationTargets';

/** Set once the player window follows the presented scene; it starts with the first presentation through it. */
let followingPresentedScene = false;
/** The view store and tab the player window streams live, or null while it streams nothing. */
let streamed: { store: StoreApi<ViewAtlasState>; tabId: string } | null = null;

/** Present the active view's current scene tab, opening the player window if needed. */
export async function presentActiveTabInPlayerWindow(app: App): Promise<void> {
  const view = app.workspace.getActiveViewOfType(AtlasView);
  const activeTabId = view?.tabMetaStore.getState().activeTabId ?? null;
  // A remote view shows a scene fed from outside, never one of this vault's maps.
  if (!view || view.isRemote || !activeTabId) {
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
  if (view.isClosed) return;

  const service =
    PlayerWindowService.getInstance() ??
    new PlayerWindowService(app, view.atlasStore, view.serviceManager.getSettingsService());
  if (service.isWindowOpen()) {
    service.presentCanvas(source, tabId, tab.filePath);
  } else {
    await service.openPlayerWindow(source, tabId, tab.filePath);
  }
  streamed = { store: view.atlasStore, tabId };
  followPresentedScene();
  presentedScene.present(view, tabId);
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
  await whenMapLoaded(sourceView.atlasStore);
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
  streamed = { store: sourceView.atlasStore, tabId: sourceTab.id };
  followPresentedScene();
  presentedScene.present(sourceView, sourceTab.id);
  if (previousTabId && previousTabId !== sourceTab.id) await sourceView.switchToTab(previousTabId);
}

/**
 * The player window shows the presented scene: it holds its frame while the DM
 * browses other tabs, resumes when the presented tab is back, follows a scene
 * presented elsewhere ("Present to players", only while an extension registered a
 * presentation target) and lets go of a view that closes.
 */
function followPresentedScene(): void {
  if (followingPresentedScene) return;
  followingPresentedScene = true;
  presentedScene.subscribe({
    presented: (scene, resumed) => {
      if (scene.view instanceof AtlasView) void showPresentedScene(scene.view, scene.tabId, resumed);
    },
    held: () => PlayerWindowService.getInstance()?.holdCurrentFrame(),
    // Stopping presenting or closing the presented map must not leave its renderer and store reachable from the player window
    cleared: (previous) => releaseStreamed(previous.store),
    // A view the window still streams may close after another scene was presented
    viewClosed: (view) => releaseStreamed(view.atlasStore),
  });
  // Without a registered target the presented scene is what the player window shows, so it ends with the window.
  const endWithWindow = (): void => {
    if (!playerWindowStore.getState().isOpen && !presentationTargetsRegistered()) presentedScene.clear();
  };
  playerWindowStore.subscribe((state, previous) => { if (state.isOpen !== previous.isOpen) endWithWindow(); });
  subscribePresentationTargets(endWithWindow);
}

function isStreaming(view: AtlasView, tabId: string): boolean {
  return streamed?.store === view.atlasStore && streamed.tabId === tabId;
}

/** Let go of `store`'s map in the player window, which then shows its last frame until a scene is presented. */
function releaseStreamed(store: StoreApi<ViewAtlasState>): void {
  PlayerWindowService.getInstance()?.releaseSource(store);
  if (streamed?.store === store) streamed = null;
}

/** Show the presented scene in an open player window: a held one coming back, or one presented elsewhere. */
async function showPresentedScene(view: AtlasView, tabId: string, resumed: boolean): Promise<void> {
  if (!PlayerWindowService.getInstance()?.isWindowOpen()) return;
  if (!resumed && isStreaming(view, tabId) && playerWindowStore.getState().presentedTabId === tabId) return;
  const source = await waitForRenderedFrameSource(view);
  const service = PlayerWindowService.getInstance();
  if (!source || !service || view.tabMetaStore.getState().activeTabId !== tabId) return;
  const current = presentedScene.current();
  if (current?.view !== view || current.tabId !== tabId) return;
  // Coming back to the tab: another map may have started loading during the wait for the frames.
  if (resumed && !showsTab(view, tabId)) return;
  // A held frame of this very scene goes live again; anything else re-targets the window.
  if (resumed && isStreaming(view, tabId)) service.releaseHeldFrame(source);
  else service.presentCanvas(source, tabId, findTab(view, tabId)?.filePath);
  streamed = { store: view.atlasStore, tabId };
}

function findTab(view: AtlasView, tabId: string): SceneTab | undefined {
  return view.tabMetaStore.getState().tabs.find((tab) => tab.id === tabId);
}

/** Resolve the view's frame source after the current scene load has finished and been drawn. */
async function waitForRenderedFrameSource(view: AtlasView): Promise<PlayerFrameSource | null> {
  await whenMapLoaded(view.atlasStore);
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
