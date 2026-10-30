import { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { SettingsService } from './SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../stores/playerWindowStore';
import './player-window.scss';
import { PlayerInitiativePanel } from './PlayerInitiativePanel';
import { PlayerTurnBanner } from './PlayerTurnBanner';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import { PlayerDiceRolls } from './PlayerDiceRolls';
import { PlayerWidgetBar } from './PlayerWidgetBar';
import { LocalPlayerView, LOCAL_PLAYER_VIEW_TYPE, type PlayerCameraState } from '../local-player-view';
import { freezeCanvasFrame, type SceneTransition } from '../pixi/sceneTransition';
import { t } from '../i18n';
import { cannotRender, PlayerFrameMirror, type PlayerFrameSource } from './PlayerFrameMirror';
import { framedCamera } from './playerFrame';
import type { PlayerFrame, Screen, Size } from '../types/playerFrame';
import { presentedSceneOf, type PresentedScene } from './presentedScene';
import { onMapRulesChange } from './mapRules';
import { showNotice } from '../ui/notice';
import { frameWorldSize, tableTvOf, tableTvPlayerFrame, type TableTv } from './tableTvFrame';
import { applyTableTvLook, PLAYER_OVERLAYS_CLASS } from './playerWindowTurn';

/** Scopes the rules in `player-window.scss` to the popout document. */
const PLAYER_WINDOW_BODY_CLASS = 'atlas-player-window';
/** Set once frames are being mirrored: swaps the loading message for the canvas. */
const PLAYER_WINDOW_LIVE_CLASS = 'atlas-player-window--live';

/** Identifies a stylesheet node so the same sheet is not added to the popout twice. */
function getStyleNodeKey(node: Element): string {
  return node.instanceOf(HTMLLinkElement) ? `link:${node.href}` : `style:${node.textContent ?? ''}`;
}

/** What stands in for a map view that closed: it renders nothing, and players keep the frame they hold. */
const CLOSED_SOURCE: PlayerFrameSource = { withPlayerSafeFrame: () => undefined };

/**
 * Shows a DM map view's scene in a popout window for players.
 *
 * The window shows one scene tab at a time, the presented scene (see `presentedScene.ts`).
 * While the DM works on another tab the last frame is held so players never see
 * the DM's navigation; `PlayerWindowPresenter` drives that hold/release cycle.
 * A camera freeze only pins the camera: the scene keeps updating (tokens, fog)
 * while the DM pans and zooms their own view.
 */
export class PlayerWindowService {
  private playerWindow: Window | null = null;
  private playerView: LocalPlayerView | null = null;
  private app: App;
  private store: StoreApi<ViewAtlasState>;
  private settingsService: SettingsService;
  private streamSource: PlayerFrameSource | null = null;
  private animationFrame: number | null = null;
  /** Camera the DM froze players on; the presented scene is still rendered live through it. */
  private frozenCamera: PlayerCameraState | null = null;
  /** The camera of the last frame players were shown of the presented scene; none until a frame of that scene came. */
  private shownCamera: PlayerCameraState | null = null;
  /** The level of the shown tab players see; another level of the same tab is another picture, as another tab is. */
  private shownLevelId: string | null = null;
  /** Last player frame, shown unchanged while the DM works on another scene tab. */
  private heldFrame: HTMLCanvasElement | null = null;
  /** Crossfade from the previous map, still playing after the DM presented another scene. */
  private mapTransition: SceneTransition | null = null;
  private static instance: PlayerWindowService | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  /** Widget bar, initiative panel and dice rolls, drawn over the presented scene. */
  private sceneOverlays: PlayerOverlay[] = [];
  private readonly boundHandleBeforeUnload = (): void => {
    this.cleanup(false);
  };
  private isCleaningUp = false;
  /** Brings frames of the presented scene into the window; exists while frames are being mirrored. */
  private mirror: PlayerFrameMirror | null = null;
  /** Identifies the running frame loop; a newer loop ends older ones. */
  private mirrorLoopId = 0;

  constructor(app: App, store: StoreApi<ViewAtlasState>, settingsService: SettingsService) {
    this.app = app;
    this.store = store;
    this.settingsService = settingsService;
    PlayerWindowService.instance = this;
  }

  public static getInstance(): PlayerWindowService | null {
    return PlayerWindowService.instance;
  }

  /**
   * Toggle the DM's camera freeze and return the new frozen state. Where players are not shown
   * the presented scene yet there is nothing to freeze them on, and the DM is told so.
   */
  public toggleCameraFreeze(): boolean {
    if (this.frozenCamera) {
      this.setFrozenCamera(null);
      showNotice(t('player.unfrozen'));
      return false;
    }
    this.freezeCamera();
    showNotice(this.isFrozen() ? t('player.frozen') : t('player.nothingToFreeze'));
    return this.isFrozen();
  }

  /**
   * Keep players on `camera`, by default the camera they currently see, and on the world
   * rectangle it frames: map changes stay visible; the DM's panning and zooming, and the size
   * of the DM's pane, no longer reach them.
   */
  public freezeCamera(camera?: PlayerCameraState): void {
    this.setFrozenCamera(camera ?? this.cameraPlayersSee());
  }

  /**
   * Freezes players centred on the world point (x, y) of the scene shown in `tabId`, at the zoom
   * they have (Frame player view). Returns false, changing nothing, when players see another scene.
   */
  public framePlayersOn(tabId: string, x: number, y: number): boolean {
    const camera = this.framingCamera(tabId);
    if (!camera) return false;
    this.setFrozenCamera({ ...camera, centerX: x, centerY: y });
    return true;
  }

  /** The camera players are on, moved to the world point (x, y): to present another scene framed there; null while the window is closed. */
  public playerCameraAt(x: number, y: number): PlayerCameraState | null {
    const camera = this.isWindowOpen() ? this.frozenCamera ?? this.cameraPlayersSee() : null;
    return camera ? { ...camera, centerX: x, centerY: y } : null;
  }

  /**
   * What players see now of the scene on `tabId`: their frame's centre and size in world units;
   * null where they see another scene, a held frame, or no window is open.
   */
  public playerViewFrame(tabId: string): { centerX: number; centerY: number; width: number; height: number } | null {
    const camera = this.framingCamera(tabId);
    const size = camera ? this.playerViewWorldSize() : null;
    return camera && size ? { centerX: camera.centerX, centerY: camera.centerY, ...size } : null;
  }

  /** The map area players see at their zoom, in world units, on `source`'s map (by default the one they see); null without a live scene. */
  public playerViewWorldSize(source: PlayerFrameSource | null = this.streamSource): Size | null {
    const frame = this.playerFrameOf(source);
    return frame ? frameWorldSize(frame) : null;
  }

  /** The camera players see the scene of `tabId` through, where they see it live. */
  private framingCamera(tabId: string): PlayerCameraState | null {
    if (!this.isWindowOpen() || this.heldFrame || playerWindowStore.getState().shownTabId !== tabId) return null;
    return this.frozenCamera ?? this.cameraPlayersSee();
  }

  /** The frame the mirror would render of `source` through the camera players are on: the same function, so the outline is what players get. */
  private playerFrameOf(source: PlayerFrameSource | null): PlayerFrame | null {
    const canvas = this.playerWindow?.document.getElementById('atlas-player-canvas');
    const window = canvas?.instanceOf(HTMLCanvasElement) ? this.windowScreen(canvas) : null;
    const camera = this.isWindowOpen() ? this.frozenCamera ?? this.cameraPlayersSee() : null;
    if (!source || !window || !camera) return null;
    return tableTvPlayerFrame(window, camera, source.getScreen?.(), this.tableTv(), source.getGridSize?.());
  }

  /**
   * The camera players see the presented scene through now: that of its last frame, else the
   * DM's own. Never a camera of another scene: the one players saw before this scene was
   * presented frames a rectangle of that scene's map; while a frame is held the view shows the
   * scene the DM browses, through its camera; and while the scene loads the view's camera is
   * not the scene's yet. With none of its own, there is nothing to freeze on yet.
   */
  private cameraPlayersSee(): PlayerCameraState | null {
    if (this.shownCamera) return this.shownCamera;
    const source = this.streamSource;
    if (!source || this.heldFrame || cannotRender(source)) return null;
    return source.getCamera?.() ?? null;
  }

  public isFrozen(): boolean {
    return this.frozenCamera !== null;
  }

  public isWindowOpen(): boolean {
    return this.playerWindow !== null && !this.playerWindow.closed;
  }

  /** The open popout window, or null when there is none. */
  public getWindow(): Window | null {
    return this.isWindowOpen() ? this.playerWindow : null;
  }

  /** Whether the open window shows live frames of the view that owns `store`, rendered from that view. */
  public mirrors(store: StoreApi<ViewAtlasState>): boolean {
    return this.isWindowOpen() && this.streamSource?.store === store && this.heldFrame === null;
  }

  /** Keep players on the current frame while the DM works on another scene tab. */
  public holdCurrentFrame(): void {
    if (!this.isWindowOpen()) return;
    this.sceneOverlays.forEach((overlay) => overlay.hold());
    if (this.heldFrame) return;
    this.heldFrame = this.snapshotPlayerFrame();
    this.updateFreezeIndicator();
  }

  /**
   * Keep players on the last frame and let go of the map view that owns `store`,
   * which is closing. Presenting another scene resumes live mirroring.
   */
  public releaseSource(store: StoreApi<ViewAtlasState>): void {
    if (!this.streamSource || this.streamSource.store !== store) return;
    this.holdCurrentFrame();
    this.sceneOverlays.forEach((overlay) => overlay.releaseSource?.());
    this.streamSource = CLOSED_SOURCE;
    this.followSource();
  }

  /**
   * Point the mirror at the new `streamSource` now. The window's next display frame, which
   * would do it, never comes while the window is hidden, and the previous view would stay referenced.
   */
  private followSource(): void {
    this.mirror?.frame();
  }

  /**
   * Resume live mirroring from `source` once the presented scene is rendered again.
   * A camera freeze stays in place, so players return to the same framing.
   */
  public releaseHeldFrame(source: PlayerFrameSource): void {
    if (!this.isWindowOpen()) return;
    this.streamSource = source;
    this.pinFrozenCamera();
    this.mirror?.markStale();
    this.presentScene();
    this.heldFrame = null;
    this.updateFreezeIndicator();
    this.followSource();
  }

  /**
   * Show the scene tab `tabId`, already rendered into `source`, to players.
   * Any freeze is lifted because the DM explicitly chose what players see; with `camera`
   * (Frame player view on a scene players did not see), players are frozen on it instead.
   */
  public presentCanvas(source: PlayerFrameSource, tabId: string, filePath?: string, camera?: PlayerCameraState): void {
    if (!this.isWindowOpen()) {
      showNotice(t('player.notOpen'));
      return;
    }
    const levelId = presentedSceneOf(this.app).get()?.levelId ?? null;
    const anotherScene = playerWindowStore.getState().shownTabId !== tabId || this.shownLevelId !== levelId;
    this.shownLevelId = levelId;
    if (anotherScene) this.crossfadeToNextMap();
    this.streamSource = source;
    this.mirror?.markStale();
    this.presentScene();
    this.heldFrame = null;
    this.setFrozenCamera(camera ?? null);
    // The camera players saw the scene before through says nothing about this one
    if (anotherScene) this.shownCamera = null;
    playerWindowStore.setState({ shownTabId: tabId });
    this.playerView?.updateSession({
      tabId, ...(filePath ? { filePath } : {}), levelId: levelId ?? undefined, frozen: this.isFrozen(), ...(anotherScene && !this.isFrozen() ? { camera: null } : {}),
    });
    this.followSource();
  }

  /** The player window's view when its leaf is open, attached or not; null when there is none. */
  public static openPlayerView(app: App): LocalPlayerView | null {
    const view = app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE)[0]?.view;
    return view instanceof LocalPlayerView && !view.isClosed ? view : null;
  }

  /**
   * Opens the player window's leaf in a popout (or reuses the one there is) on `scene`; the
   * presenter then attaches it to the view that holds the scene. Null when Obsidian gave no player view.
   */
  public static async openLeaf(app: App, scene: PresentedScene): Promise<LocalPlayerView | null> {
    const leaf = app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE)[0] ?? app.workspace.openPopoutLeaf();
    await leaf.setViewState({ type: LOCAL_PLAYER_VIEW_TYPE, state: { tabId: scene.tabId, filePath: scene.filePath, ...(scene.levelId ? { levelId: scene.levelId } : {}), frozen: false } });
    return leaf.view instanceof LocalPlayerView ? leaf.view : null;
  }

  public ownsView(view: LocalPlayerView): boolean {
    return this.playerView === view;
  }

  public attachToView(view: LocalPlayerView, source: PlayerFrameSource, scene: PresentedScene): void {
    this.playerView = view;
    this.shownLevelId = scene.levelId ?? null;
    this.playerWindow = view.contentEl.win;
    this.streamSource = source;
    this.shownCamera = null;
    this.pinFrozenCamera();
    this.mirror?.markStale();
    playerWindowStore.setState({ shownTabId: scene.tabId });
    view.updateSession({ tabId: scene.tabId, filePath: scene.filePath, levelId: scene.levelId });
    // Bind now: the popout may still be loading, and the DM can switch tabs before it has
    this.destroySceneOverlays();
    this.sceneOverlays = [
      new PlayerWidgetBar(this.settingsService),
      new PlayerInitiativePanel(this.app, this.settingsService),
      new PlayerDiceRolls(this.app, this.settingsService),
      new PlayerTurnBanner(this.app, this.settingsService),
    ];
    this.presentScene();
    this.setupPlayerWindow();
  }

  private setFrozenCamera(camera: PlayerCameraState | null): void {
    this.frozenCamera = camera ? framedCamera({ ...camera }, this.streamSource?.getScreen?.()) : null;
    this.mirror?.markStale();
    this.updateFreezeIndicator();
    playerWindowStore.setState({ isFrozen: this.isFrozen() });
    this.playerView?.updateSession({ frozen: this.isFrozen(), ...(this.frozenCamera ? { camera: { ...this.frozenCamera } } : {}) });
  }

  /**
   * A frozen camera that came without the world rectangle it frames (one an older Atlas saved,
   * or one frozen before a scene was attached) takes what the DM's screen shows through it now,
   * and keeps that.
   */
  private pinFrozenCamera(): void {
    if (!this.frozenCamera) return;
    const pinned = framedCamera(this.frozenCamera, this.streamSource?.getScreen?.());
    if (pinned === this.frozenCamera) return;
    this.frozenCamera = pinned;
    this.playerView?.updateSession({ camera: { ...pinned } });
  }

  private updateFreezeIndicator(): void {
    if (!this.playerWindow || this.playerWindow.closed) return;
    const indicator = this.playerWindow.document.getElementById('atlas-player-freeze-indicator');
    if (indicator) {
      indicator.style.display = this.frozenCamera || this.heldFrame ? 'flex' : 'none';
    }
  }

  /** Fades the frame players see into the next scene, the same transition the DM view plays. */
  private crossfadeToNextMap(): void {
    const targetCanvas = this.playerWindow?.document.getElementById('atlas-player-canvas');
    if (!targetCanvas?.instanceOf(HTMLCanvasElement)) return;
    // A 2D canvas keeps its pixels, so the frame on screen can be copied at any time.
    // Players get the crossfade without the scale settle, which would resample a frame of the window's own pixels at every step.
    this.mapTransition = freezeCanvasFrame(
      targetCanvas, (context) => context.drawImage(targetCanvas, 0, 0), this.mapTransition, { settle: false },
    );
    this.mapTransition?.play();
  }

  /** Copy the frame players currently see so it can be held while the DM is elsewhere. */
  private snapshotPlayerFrame(): HTMLCanvasElement | null {
    if (!this.streamSource || !this.playerWindow || this.playerWindow.closed) return null;

    const targetCanvas = this.playerWindow.document.getElementById('atlas-player-canvas') as HTMLCanvasElement | null;
    if (!targetCanvas) return null;

    // Never attached to a document: it is only a pixel buffer, so it can live in the
    // main window. drawImage works across windows, as the live mirroring relies on.
    const snapshot = createEl('canvas');
    snapshot.width = targetCanvas.width;
    snapshot.height = targetCanvas.height;
    snapshot.getContext('2d')?.drawImage(targetCanvas, 0, 0);
    return snapshot;
  }

  /**
   * Mirrors the main window's stylesheets into the popout by cloning the existing
   * `<link>`/`<style>` nodes, skipping the ones Obsidian already placed there.
   */
  private copyMainWindowStyles(doc: Document): void {
    const existing = new Set(
      Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style')).map(getStyleNodeKey),
    );
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      if (existing.has(getStyleNodeKey(node))) return;
      doc.head.appendChild(doc.importNode(node, true));
    });
  }

  /**
   * Sets up the player window after it's been opened
   */
  private setupPlayerWindow(): void {
    if (!this.playerWindow) return;

    try {
      const doc = this.playerWindow.document;
      
      // Wait for the popout window to be fully loaded
      if (doc.readyState !== 'complete') {
        this.playerWindow.addEventListener('load', () => {
          this.setupPlayerWindow();
        }, { once: true });
        return;
      }
      
      // Hide all Obsidian UI elements
      const body = doc.body;
      
      // Double-check we have the right window
      if (this.playerWindow === window) {
        console.error('[PlayerWindowService] ERROR: Player window is the same as main window!');
        showNotice(t('player.isMain'));
        return;
      }
      
      const content = this.playerView?.contentEl ?? body;
      content.empty();
      
      this.copyMainWindowStyles(doc);
      body.classList.add(PLAYER_WINDOW_BODY_CLASS);
      body.classList.remove(PLAYER_WINDOW_LIVE_CLASS);

      // Create our UI elements
      const loading = content.createDiv();
      loading.id = 'atlas-player-loading';
      loading.textContent = t('player.connecting');

      const canvas = content.createEl('canvas');
      canvas.id = 'atlas-player-canvas';

      // Widgets, initiative, dice and the freeze badge turn with the map on a sideways table TV
      const overlayLayer = content.createDiv({ cls: PLAYER_OVERLAYS_CLASS });
      const applyTurn = (): void => applyTableTvLook(body, overlayLayer, this.settingsService.getTableTvSettings());
      applyTurn();
      this.sceneOverlays.forEach((overlay) => overlay.mount(overlayLayer));
      this.settingsUnsubscribe?.();
      // Player view settings decide which layers players see
      // So do the rules the scene plays by: which resources they see
      const stopRules = onMapRulesChange(this.app, 'any', () => {
        this.mirror?.markStale();
        this.sceneOverlays.forEach((overlay) => overlay.refresh?.());
      });
      const unsubscribeSettings = this.settingsService.onChange(() => {
        this.mirror?.markStale();
        applyTurn();
      });
      this.settingsUnsubscribe = () => {
        unsubscribeSettings();
        stopRules();
      };

      // Create freeze indicator
      const freezeIndicator = overlayLayer.createDiv();
      freezeIndicator.id = 'atlas-player-freeze-indicator';
      const freezeIcon = freezeIndicator.createSvg('svg', { attr: {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      } });
      freezeIcon.createSvg('line', { attr: { x1: 2, y1: 12, x2: 22, y2: 12 } });
      freezeIcon.createSvg('line', { attr: { x1: 12, y1: 2, x2: 12, y2: 22 } });
      freezeIcon.createSvg('path', { attr: { d: 'M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4' } });
      freezeIndicator.createSpan({ text: t('player.paused') });
      freezeIndicator.style.display = this.frozenCamera || this.heldFrame ? 'flex' : 'none';
      
      // Create title bar container
      const titleBarContainer = content.createDiv();
      titleBarContainer.id = 'atlas-player-titlebar-container';
      
      // Create title bar for dragging
      const titleBar = titleBarContainer.createDiv();
      titleBar.id = 'atlas-player-titlebar';
      const titleBarText = titleBar.createDiv();
      titleBarText.id = 'atlas-player-titlebar-text';
      titleBarText.textContent = t('player.title');
      

      // Set window title
      doc.title = t('player.title');

      // Start mirroring
      this.startMirroring();
      playerWindowStore.setState({ isOpen: true });

      // Cleanup on close
      this.playerWindow.addEventListener('beforeunload', this.boundHandleBeforeUnload);

    } catch (error) {
      console.error('[PlayerWindowService] Error setting up player window:', error);
      showNotice(t('player.setupFailed'));
    }
  }

  /** Bind the overlays to the view store that now holds the presented scene. */
  private presentScene(): void {
    const store = this.streamSource?.store ?? this.store;
    const source = this.streamSource;
    this.sceneOverlays.forEach((overlay) => overlay.present(store, source?.diceEvents, source?.rollSources, source?.badgeNumbers));
  }

  private destroySceneOverlays(): void {
    this.sceneOverlays.forEach((overlay) => overlay.destroy());
    this.sceneOverlays = [];
  }

  /** Starts the loop that brings frames of the presented scene onto the window's canvas, one check per display frame. */
  private startMirroring(): void {
    if (!this.playerWindow || !this.streamSource) return;

    const targetCanvas = this.playerWindow.document.getElementById('atlas-player-canvas') as HTMLCanvasElement;
    
    if (!targetCanvas) return;

    const targetCtx = targetCanvas.getContext('2d');
    if (!targetCtx) return;

    this.playerWindow.document.body.classList.add(PLAYER_WINDOW_LIVE_CLASS);

    const loopId = ++this.mirrorLoopId;
    this.mirror?.stop();
    const mirror = new PlayerFrameMirror(targetCanvas, targetCtx, {
      source: () => this.streamSource,
      window: () => this.windowScreen(targetCanvas),
      heldFrame: () => this.heldFrame,
      frozenCamera: () => this.frozenCamera,
      settings: () => this.settingsService.getLocalPlayerViewSettings(),
      tableTv: () => this.tableTv(),
      onFrame: (camera) => this.recordPlayerCamera(camera),
    });
    this.mirror = mirror;

    const mirrorFrame = (): void => {
      if (loopId !== this.mirrorLoopId) return;
      if (!this.playerWindow || this.playerWindow.closed || !this.streamSource) {
        this.cleanup();
        return;
      }

      this.animationFrame = this.playerWindow.requestAnimationFrame(mirrorFrame);
      mirror.frame();
    };

    mirrorFrame();
  }

  /**
   * The player window as the frames are rendered for it: the canvas fills it, so the canvas'
   * size is the window's, and the pixel ratio is that of the screen the window is on now.
   */
  private windowScreen(canvas: HTMLCanvasElement): Screen | null {
    if (!this.playerWindow || this.playerWindow.closed) return null;
    return { width: canvas.clientWidth, height: canvas.clientHeight, resolution: this.playerWindow.devicePixelRatio || 1 };
  }

  /** The table TV the player window is, read anew for every frame; none while the window is closed. */
  private tableTv(): TableTv | undefined {
    const win = this.playerWindow;
    return win && !win.closed ? tableTvOf(win, this.settingsService.getTableTvSettings()) : undefined;
  }

  /** Persist the camera players see so a restored window reopens on the same framing. */
  private recordPlayerCamera(camera: PlayerCameraState | undefined): void {
    if (!camera) return;
    this.shownCamera = camera;
    const previous = this.playerView?.getState().camera;
    const changed = camera.centerX !== previous?.centerX || camera.centerY !== previous.centerY || camera.scale !== previous.scale
      || camera.width !== previous.width || camera.height !== previous.height;
    if (changed) this.playerView?.updateSession({ camera });
  }

  /**
   * Cleanup resources
   */
  private cleanup(closeWindow = true): void {
    if (this.isCleaningUp) {
      return;
    }

    this.isCleaningUp = true;
    this.mirrorLoopId++;
    this.mirror?.stop();
    this.mirror = null;

    if (this.animationFrame) {
      this.playerWindow?.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.destroySceneOverlays();
    this.mapTransition?.cancel();
    this.mapTransition = null;

    this.playerWindow?.removeEventListener('beforeunload', this.boundHandleBeforeUnload);
    
    if (closeWindow && this.playerWindow && !this.playerWindow.closed) {
      this.playerWindow.close();
    }
    
    this.playerWindow = null;
    this.playerView = null;
    this.streamSource = null;
    this.heldFrame = null;
    this.frozenCamera = null;
    this.shownCamera = null;
    resetPlayerWindowStore();
    // The window is gone: drop the singleton so the next present binds to the presenting view's store.
    if (PlayerWindowService.instance === this) {
      PlayerWindowService.instance = null;
    }
    this.isCleaningUp = false;
  }

  /**
   * Destroy the service
   */
  public destroy(closeWindow = true): void {
    this.cleanup(closeWindow);
  }
}
