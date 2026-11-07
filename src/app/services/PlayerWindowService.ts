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
import { t } from '../i18n';
import { cannotRender, PlayerFrameMirror, type PlayerFrameSource } from './PlayerFrameMirror';
import { framedCamera, PLAYER_FRAME_4K_PIXEL_BUDGET, PLAYER_FRAME_PIXEL_BUDGET } from './playerFrame';
import type { PlayerFrame, Screen, Size, WorldFrame } from '../types/playerFrame';
import { presentedSceneOf, type PresentedScene } from './presentedScene';
import { onMapRulesChange } from './mapRules';
import { showNotice } from '../ui/notice';
import { frameWorldSize, tableTvOf, tableTvPlayerFrame, type TableTv, type TvSetupScreen } from './tableTvFrame';
import { glideCamera } from './tableTv';
import { prefersReducedMotion } from '../utils/motion';
import { applyTableTvLook, PLAYER_OVERLAYS_CLASS } from './playerWindowTurn';
import { glassFrame, PlayerGlass, sameCamera, withSetupScreen } from './playerGlass';
import { CURTAIN_DOWN_MS, removePlayerCurtain, showPlayerCurtain } from './playerCurtain';
import { PlayerSceneFade } from './playerSceneFade';
import { watchPlayerWindowDisplay } from './playerWindowDisplay';
import { keepPlayerWindowAwake } from './playerWindowThrottling';

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
  /** Identifies the running glide of frozen players; any other change of their camera ends it. */
  private glideId = 0;
  /** The set-up screen on the TV and the followers of the players' camera. */
  private readonly glass = new PlayerGlass();
  /** Whether the curtain is down: players see black until it is lifted, whatever is presented meanwhile. */
  private curtained = false;
  /** Until when the curtain's sheet is on its way down. */
  private curtainFallingUntil = 0;
  /** The dip to black while the presented scene changes; the curtain above wins over it. */
  private readonly sceneFade = new PlayerSceneFade((down) => {
    const win = this.getWindow();
    if (win) showPlayerCurtain(win.document, down);
  }, () => this.curtained);
  /** Stops keeping the store's `fullScreen` and `secondDisplay` current for the open popout. */
  private stopDisplayWatch: (() => void) | null = null;
  /** Lets the popout be throttled again once it is no longer the player window (`keepPlayerWindowAwake`). */
  private stopKeepingAwake: (() => void) | null = null;

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
      this.unfreezeCamera();
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

  /** Lets players follow the GM's camera again, without a word: the glass's pin. */
  public unfreezeCamera(): void {
    if (this.frozenCamera) this.setFrozenCamera(null);
  }

  /**
   * Freezes players centred on the world point (x, y) of the scene shown in `tabId`, at the zoom
   * they have (Frame player view). Returns false, changing nothing, when players see another scene.
   */
  public framePlayersOn(tabId: string, x: number, y: number): boolean {
    const camera = this.framingCamera(tabId);
    return camera ? this.playersToCamera(tabId, { ...camera, centerX: x, centerY: y }) : false;
  }

  /**
   * Freezes players on `camera` of the scene shown in `tabId`, gliding there, and keeps it as the
   * frame they return to (a frame the GM saved). False, changing nothing, where players see another scene.
   */
  public playersToCamera(tabId: string, camera: PlayerCameraState): boolean {
    if (!this.framingCamera(tabId)) return false;
    const to = { ...camera };
    this.rememberFrame(this.playerView?.getState().filePath || tabId, to);
    this.moveFrozenCamera(to);
    return true;
  }

  /** Whether players see their TV at true scale now: switched on, and the TV's screen fitted to a card. */
  public isTrueScale(): boolean {
    const tv = this.tableTv();
    return !!tv?.trueScale && tv.setup !== null;
  }

  /** The glass on the map of `tabId`: what players see of it, pinned or following; null where they see another scene. */
  public glassOf(tabId: string): WorldFrame | null {
    return this.framingCamera(tabId) ? glassFrame(this.playerViewFrame(tabId), this.frozenCamera) : null;
  }

  /** Runs `listener` whenever the camera players see through moves: a freeze, a glide step, a frame through another camera. */
  public onPlayersCameraChange(listener: () => void): () => void {
    return this.glass.onCameraChange(listener);
  }

  /** Shows TrueScale's set-up screen on the TV over the players' frame, or takes it away (null). */
  public showSetup(state: TvSetupScreen | null): void {
    this.glass.showSetup(state);
    this.mirror?.markStale();
  }

  /** The screen the open player window is on (`screenKey`), which its setup is stored by; null while it is closed. */
  public setupScreenKey(): string | null {
    return this.tableTv()?.screenKey ?? null;
  }

  /** Keeps `camera` as the frame players return to when `map` is presented again. */
  private rememberFrame(map: string, camera: PlayerCameraState): void {
    const frames = this.playerView?.getState().frames;
    this.playerView?.updateSession({ frames: { ...frames, [map]: { ...camera } } });
  }

  /** Whether players' pictures may move on their way to the next: `viewGlideMs` is 0, or the window's OS setting says not, and they jump. */
  private movesGently(win: Window): boolean {
    return this.settingsService.getTableTvSettings().viewGlideMs > 0 && !prefersReducedMotion(win.document.body);
  }

  /**
   * Freezes players on `to`, gliding there from the camera they see, frozen or following. Under
   * the curtain there is nothing to see of it. Every step is an ordinary frame, fog and lighting included.
   */
  private moveFrozenCamera(to: PlayerCameraState): void {
    const camera = this.frozenCamera ?? this.cameraPlayersSee();
    const win = this.playerWindow;
    if (!camera || !win || this.curtained || sameCamera(camera, to) || !this.movesGently(win)) {
      this.setFrozenCamera(to);
      return;
    }
    // Players who followed the GM stop doing so here, not when the glide lands
    if (!this.frozenCamera) this.setFrozenCamera(camera, false);
    const from = this.frozenCamera ?? camera;
    const { viewGlideMs } = this.settingsService.getTableTvSettings();
    const glide = ++this.glideId;
    const start = win.performance.now();
    const step = (now: number): void => {
      if (glide !== this.glideId || !this.isWindowOpen()) return;
      const t = Math.min(1, (now - start) / viewGlideMs);
      if (t >= 1) {
        this.setFrozenCamera(to);
        return;
      }
      this.frozenCamera = glideCamera(from, to, t);
      this.mirror?.markStale();
      this.glass.cameraChanged();
      win.requestAnimationFrame(step);
    };
    win.requestAnimationFrame(step);
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
    return tableTvPlayerFrame(window, camera, source.getScreen?.(), this.tableTv(), source.getGridSize?.(), this.pixelBudget());
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

  public isCurtained(): boolean {
    return this.curtained;
  }

  /**
   * Lowers the curtain, so players see black and nothing is rendered for them, or lifts it. It
   * stays down across presents and levels, and in the window's session: a restored window comes
   * back with the curtain down.
   */
  public setCurtain(down: boolean): void {
    const win = this.getWindow();
    if (!win || this.curtained === down) return;
    this.curtained = down;
    playerWindowStore.setState({ curtain: down });
    this.playerView?.updateSession({ curtain: down });
    if (down) {
      this.sceneFade.cancel();
      this.curtainFallingUntil = performance.now() + CURTAIN_DOWN_MS;
      showPlayerCurtain(win.document, true);
      return;
    }
    // The sheet stays until the canvas holds a picture again, its fade off that picture
    this.sceneFade.awaitFrame(performance.now());
    this.mirror?.markStale();
    this.mirror?.frame();
    // A held frame is drawn at once and reports no frame; without a mirror none will come
    if (this.heldFrame || !this.mirror) this.sceneFade.finish();
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

  /** The frame players are shown of the view that owns `store`, while they see it live; null otherwise. */
  public liveFrameOf(store: StoreApi<ViewAtlasState>): PlayerFrame | null {
    return this.mirrors(store) ? this.playerFrameOf(this.streamSource) : null;
  }

  /** Keep players on the current frame while the DM works on another scene tab. */
  public holdCurrentFrame(): void {
    if (!this.isWindowOpen()) return;
    this.sceneOverlays.forEach((overlay) => overlay.hold());
    // No frame of the new scene comes while one is held: players are shown this one
    this.sceneFade.finish();
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
   * Show the scene tab `tabId`, already rendered into `source`, to players. With `camera` (Frame
   * player view on a scene players did not see) they are frozen on it. Otherwise a map the GM
   * framed before returns them to that frame, and a freeze carries over, on the DM's current
   * framing: gliding there on the same map, at once on another. Only players who were not frozen
   * follow the DM, as before.
   */
  public presentCanvas(source: PlayerFrameSource, tabId: string, filePath?: string, camera?: PlayerCameraState): void {
    if (!this.isWindowOpen()) {
      showNotice(t('player.notOpen'));
      return;
    }
    const levelId = presentedSceneOf(this.app).get()?.levelId ?? null;
    const anotherScene = playerWindowStore.getState().shownTabId !== tabId || this.shownLevelId !== levelId;
    this.shownLevelId = levelId;
    if (anotherScene) this.dipToNextScene();
    this.streamSource = source;
    this.mirror?.markStale();
    this.presentScene();
    this.heldFrame = null;
    // The camera players saw the scene before through says nothing about this one
    if (anotherScene) this.shownCamera = null;
    const map = filePath || tabId;
    const remembered = anotherScene ? this.playerView?.getState().frames?.[map] : undefined;
    if (camera) {
      this.rememberFrame(map, camera);
      if (anotherScene) this.setFrozenCamera(camera);
      else this.moveFrozenCamera(camera);
    } else if (remembered) {
      this.setFrozenCamera(remembered);
    } else if (this.frozenCamera) {
      const framing = source.getCamera?.() ?? null;
      if (framing && !anotherScene) this.moveFrozenCamera(framing);
      else this.setFrozenCamera(framing);
    }
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
    this.curtained = view.getState().curtain === true;
    this.sceneFade.cancel();
    this.pinFrozenCamera();
    this.mirror?.markStale();
    playerWindowStore.setState({ shownTabId: scene.tabId, curtain: this.curtained });
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

  /** `persist` false leaves the window's session as it is: for steps of a drag, whose drop writes it. */
  private setFrozenCamera(camera: PlayerCameraState | null, persist = true): void {
    this.glideId++;
    this.frozenCamera = camera ? framedCamera({ ...camera }, this.streamSource?.getScreen?.()) : null;
    this.mirror?.markStale();
    this.updateFreezeIndicator();
    playerWindowStore.setState({ isFrozen: this.isFrozen() });
    if (persist) this.playerView?.updateSession({ frozen: this.isFrozen(), ...(this.frozenCamera ? { camera: { ...this.frozenCamera } } : {}) });
    this.glass.cameraChanged();
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

  /** Dips what players see to black: the next scene waits behind the sheet (`PlayerSceneFade`). */
  private dipToNextScene(): void {
    const win = this.getWindow();
    if (win && this.movesGently(win)) this.sceneFade.begin(performance.now());
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
      showPlayerCurtain(doc, this.curtained);

      // Create our UI elements
      const loading = content.createDiv();
      loading.id = 'atlas-player-loading';
      loading.textContent = t('player.connecting');

      const canvas = content.createEl('canvas');
      canvas.id = 'atlas-player-canvas';

      // Widgets, initiative, dice and the freeze badge turn with the map on a sideways table TV
      const overlayLayer = content.createDiv({ cls: PLAYER_OVERLAYS_CLASS });
      const applyTurn = (): void => {
        const tv = this.tableTv();
        if (tv) applyTableTvLook(body, overlayLayer, tv);
      };
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
      this.stopDisplayWatch?.();
      this.stopDisplayWatch = watchPlayerWindowDisplay(this.playerWindow, window);
      this.stopKeepingAwake?.();
      this.stopKeepingAwake = keepPlayerWindowAwake(this.playerWindow);
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
      setup: () => this.glass.setupScreen(),
      pixelBudget: () => this.pixelBudget(),
      curtained: () => this.curtained,
      curtainFalling: (time) => time < this.curtainFallingUntil,
      withheld: (time) => this.sceneFade.withholds(time),
      onFrame: (camera) => {
        this.recordPlayerCamera(camera);
        this.sceneFade.finish();
      },
    });
    this.mirror = mirror;

    const mirrorFrame = (): void => {
      if (loopId !== this.mirrorLoopId) return;
      if (!this.playerWindow || this.playerWindow.closed || !this.streamSource) {
        this.cleanup();
        return;
      }

      this.animationFrame = this.playerWindow.requestAnimationFrame(mirrorFrame);
      this.sceneFade.expire(performance.now());
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

  /** The table TV the player window is, read anew for every frame, at the dial's cell while it is being fitted; none while the window is closed. */
  private tableTv(): TableTv | undefined {
    const win = this.playerWindow;
    if (!win || win.closed) return undefined;
    const tv = tableTvOf(win, this.settingsService.getTableTvSettings(), this.settingsService.getTableTvDevice());
    return withSetupScreen(tv, this.glass.setupScreen());
  }

  /** Most pixels a players' frame is rendered with on this device (the player view settings). */
  private pixelBudget(): number {
    return this.settingsService.isPlayerView4k() ? PLAYER_FRAME_4K_PIXEL_BUDGET : PLAYER_FRAME_PIXEL_BUDGET;
  }

  /** Persist the camera players see so a restored window reopens on the same framing. */
  private recordPlayerCamera(camera: PlayerCameraState | undefined): void {
    if (!camera) return;
    const moved = !sameCamera(camera, this.shownCamera);
    this.shownCamera = camera;
    if (moved) this.glass.cameraChanged();
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
    this.sceneFade.cancel();

    this.playerWindow?.removeEventListener('beforeunload', this.boundHandleBeforeUnload);
    if (this.playerWindow && !this.playerWindow.closed) removePlayerCurtain(this.playerWindow.document);
    this.curtained = false;
    this.stopDisplayWatch?.();
    this.stopDisplayWatch = null;
    this.stopKeepingAwake?.();
    this.stopKeepingAwake = null;
    
    if (closeWindow && this.playerWindow && !this.playerWindow.closed) {
      this.playerWindow.close();
    }
    
    this.playerWindow = null;
    this.playerView = null;
    this.streamSource = null;
    this.heldFrame = null;
    this.frozenCamera = null;
    this.shownCamera = null;
    this.glass.showSetup(null);
    resetPlayerWindowStore();
    this.glass.cameraChanged();
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
