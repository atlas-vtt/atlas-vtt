/**
 * The fog of a map view: owns the fog's layer, its picture (`FogPicture`), the fog tool's
 * gesture (`FogGesture`, which in Areas mode draws, selects and edits areas) and the marks of its
 * areas (`FogAreaLayer`), and says when the picture follows the scene. Fog takes presses only
 * while the fog tool is chosen; the badges of its areas with any tool (`areaPointer`). It also
 * hands its coverage to the watch that clears fog around party tokens (`watchFogExplore`).
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { EventEmitter } from 'events';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogEdge } from '../../fog/fogEdge';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import type { FogCoverage } from '../../fog/fogCoverage';
import { isFogTool } from '../../fog/fogToolChoices';
import type { LayerVisibility } from '../playerSafeFrame';
import type { MapRect } from '../../grid/cellNumbering';
import { destroyTree } from '../utils/destroyTree';
import { levelObjects } from '../../levels/levelObjects';
import { levelMapKey } from '../../levels/sceneLevels';
import { watchFogExplore } from '../../stores/fogExploreWatch';
import { FogAreaLayer } from './FogAreaLayer';
import { mayRenameFogArea, showFogAreaMenu } from './fogAreaMenu';
import { FogGesture } from './FogGesture';
import { FogPicture, viewedFog } from './FogPicture';

/** What the viewport's dispatch (`TokenRenderer`) asks about the badges of fog areas, with any tool in the GM's view. */
export interface FogAreaPointerHandlers {
  /** The area whose badge is at the world point; null over none, and while the canvas shows the players' view. */
  hitTest(worldX: number, worldY: number): string | null;
  /** A click on the area's badge: it flips between hidden and revealed. */
  press(areaId: string): void;
  /** Whether the area's badge leaves a press to a token under it, unless the fog tool is chosen: a revealed area's does, since the party stands in it. */
  yieldsToTokens(areaId: string): boolean;
  /** Opens the menu of the area's badge at a screen point. */
  openMenu(areaId: string, screenX: number, screenY: number): void;
  /** The badge the pointer is on now, or none. */
  hover(areaId: string | null): void;
}

export class FogOfWarRenderer {
  private readonly container: PIXI.Container;
  /** The committed shapes, shared by the picture and by whoever asks what the fog covers. */
  private readonly coverageCache = new FogCoverageCache();
  private readonly picture: FogPicture;
  private readonly gesture: FogGesture;
  private readonly areas: FogAreaLayer;
  private unsubscribe?: () => void;
  private readonly stopExploring: () => void;
  /** Whether the canvas shows the players' view where the store's view switches do not say so (a peek); unset or null, they alone say it. */
  public showsPlayers: (() => boolean | null) | null = null;
  /** Whether a key pressed now is this map's to take (`canRunMapHotkeys`); unset, every key outside a text field is. */
  public keysBelongToMap: ((event: KeyboardEvent) => boolean) | null = null;
  /** Whether a key is the map's undo as the GM has bound it; unset, the key it has by default. */
  public isUndoKey: ((event: KeyboardEvent) => boolean) | null = null;

  private readonly mapImageUpdatedHandler = (): void => this.showCommitted();

  /**
   * @param mapRect the map image in world space, read whenever the fog sizes its canvas, so a
   * renamed scene or a load keeps the bounds of the image that is shown; `map-image-updated`
   * only says that it changed.
   */
  constructor(
    viewport: Viewport,
    pixiApp: PIXI.Application,
    private readonly eventBus: EventEmitter,
    private readonly store: StoreApi<ViewAtlasState>,
    mapRect: () => MapRect | null,
  ) {
    this.container = new PIXI.Container();
    this.container.label = 'fogLayer';
    this.container.eventMode = 'none';
    this.container.sortableChildren = true;
    this.container.zIndex = 1000;
    this.container.interactiveChildren = false;

    this.picture = new FogPicture({
      layer: this.container, app: pixiApp, store, mapRect, coverage: this.coverageCache,
      showsPlayers: () => this.showsPlayers?.() ?? null,
      onFadeEnd: () => this.syncShown(),
    });
    this.gesture = new FogGesture({
      layer: this.container,
      viewport,
      canvas: () => pixiApp.canvas,
      store,
      host: {
        showStroke: (stroke) => this.picture.drawStroke(stroke),
        showCommitted: () => this.showCommitted(),
      },
      mapRect,
      keysBelongToMap: (event) => this.keysBelongToMap?.(event) ?? true,
      isUndoKey: (event) => this.isUndoKey?.(event),
      showsPlayers: () => this.showsPlayers?.() ?? null,
    });

    this.areas = new FogAreaLayer({ viewport, store, showsPlayers: () => this.showsPlayers?.() ?? null });
    this.container.addChild(this.areas.view);

    this.eventBus.on('map-image-updated', this.mapImageUpdatedHandler);
    this.followStore();
    this.stopExploring = watchFogExplore(store, { coverage: () => this.getCommittedCoverage(), mapRect });

    // The scene as the store holds it now: preloaded fog shows though no change of it follows.
    if (this.store.getState().isMapLoading) this.container.visible = false;
    else this.showCommitted();
  }

  /** How the fog's edge looks, in every picture of the map. */
  setEdge(edge: FogEdge): void {
    this.picture.setEdge(edge);
  }

  getContainer(): PIXI.Container {
    return this.container;
  }

  /** The committed shape the picture draws; null means invalid geometry. */
  getCommittedCoverage(): FogCoverage | null {
    const state = this.store.getState();
    return this.coverageCache.get(viewedFog(state), levelMapKey(state.mapPath, state));
  }

  /** Local player captures share the GM's renderer but must not share its fog opacity or the tool's marks. */
  getPlayerViewLayers(): LayerVisibility[] {
    return [...this.picture.playerLayers(), ...this.gesture.playerLayers(), { layer: this.areas.view, visible: false }];
  }

  /**
   * The fog as translucent as the GM view shows it, also while the canvas is in session view:
   * for a picture of the scene, which leaves out the marks of the fog's areas like the GM's other markers.
   */
  getGmViewLayers(): LayerVisibility[] {
    return [...this.picture.gmLayers(), { layer: this.areas.view, visible: false }, ...this.gesture.areaLayers()];
  }

  /** The badges of the fog's areas for the viewport's dispatch: a click flips an area, a right-click opens its menu. */
  areaPointer(): FogAreaPointerHandlers {
    return {
      hitTest: (x, y) => this.areas.hitTest(x, y),
      press: (areaId) => { this.store.getState().flipFogArea(areaId); },
      yieldsToTokens: (areaId) => this.areas.isRevealed(areaId),
      openMenu: (areaId, screenX, screenY) => showFogAreaMenu(this.store, areaId, screenX, screenY),
      hover: (areaId) => this.areas.setHovered(areaId),
    };
  }

  /** Where the badge of area `areaId` sits in the world; null where it shows none. */
  areaBadgeSpot(areaId: string): { x: number; y: number } | null {
    return this.areas.badgeSpot(areaId);
  }

  /**
   * The canvas shows another view (the GM's or the players', a peek included): the fog takes that
   * view's opacity, and the marks of its areas show or hide with it.
   */
  refreshVisibility(): void {
    this.picture.followView();
    this.areas.refreshVisibility();
    this.gesture.refreshVisibility();
  }

  /** Whether the fog is fading from the picture before an edit to the one it has now. */
  get fading(): boolean {
    return this.picture.fading;
  }

  /** How opaque the fog is in the GM's view, as the GM set it for this device. */
  setGmOpacity(opacity: number): void {
    this.picture.setGmOpacity(opacity);
  }

  /** The fog tool hears presses after the dispatch that claims them; called once that dispatch listens. */
  reorderViewportListeners(): void {
    this.gesture.hearPressesLast();
  }

  /** The fog tool was taken up, or changed between hiding and revealing. */
  enableFogMode(): void {
    if (this.store.getState().isMapLoading) return;
    this.container.visible = true;
    this.picture.fit();
    this.picture.drawCommitted();
    this.picture.sprite.visible = true;
    this.gesture.start();
  }

  /** Another tool was taken up: a stroke under way goes, and the fog shows as the scene holds it. */
  disableFogMode(): void {
    this.gesture.stop();
    this.showCommitted();
    this.container.visible = this.picture.hasFog;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.stopExploring();
    this.eventBus.off('map-image-updated', this.mapImageUpdatedHandler);
    this.gesture.destroy();
    this.areas.destroy();
    this.picture.destroy();
    if (!this.container.destroyed) destroyTree(this.container);
  }

  /**
   * Draws the fog as the scene holds it, on a canvas of the map's size; nothing during a load,
   * whose end draws it. An `edit` of the fog fades in from the picture before it.
   */
  private showCommitted(edit = false): void {
    if (this.store.getState().isMapLoading) return;
    this.picture.fit();
    this.picture.drawCommitted(edit);
    this.syncShown();
  }

  /**
   * The layer shows while there is fog, or the fog tool to make some. Fog that fades away shows
   * until it has; geometry that cannot be drawn hides the whole map.
   */
  private syncShown(): void {
    const state = this.store.getState();
    if (state.isMapLoading) return;
    this.picture.sprite.visible = this.picture.hasFog;
    this.container.visible = this.picture.sprite.visible || isFogTool(state.activeTool);
  }

  private followStore(): void {
    let previous = this.store.getState();
    let prevFog = viewedFog(previous);
    let prevWalls = levelObjects(previous)?.walls;

    this.unsubscribe = this.store.subscribe((state) => {
      // Clear old pixels; coverage lookups synchronize their own map identity.
      const mapChanged = state.mapPath !== previous.mapPath;
      if (mapChanged) {
        this.container.visible = false;
        this.gesture.cancel();
        this.picture.clear();
      }

      const toolChanged = state.activeTool !== previous.activeTool;
      const choicesChanged = state.fogTool !== previous.fogTool;
      const loadingChanged = state.isMapLoading !== previous.isMapLoading;
      const viewChanged = state.isGMView !== previous.isGMView;
      const levelChanged = state.viewedLevel !== previous.viewedLevel;
      // What waits for its next click (a polygon) must not outlast the picture it was begun on.
      const pictureLeft = levelChanged || (state.isMapLoading && loadingChanged)
        || (viewChanged && !state.isGMView) || (state.isPlayerView && !previous.isPlayerView);
      const fog = viewedFog(state);
      const fogChanged = fog !== prevFog || mapChanged;
      const walls = levelObjects(state)?.walls;
      const wallsChanged = walls !== prevWalls;
      previous = state;
      prevFog = fog;
      prevWalls = walls;

      if (toolChanged) {
        if (isFogTool(state.activeTool)) this.enableFogMode();
        else this.disableFogMode();
      }

      // The tool's choices (its bar, the brush's keys)
      if (choicesChanged) this.gesture.follow(state.fogTool);

      // The room outlined under a resting pointer is one of the walls as they were
      if (wallsChanged && isFogTool(state.activeTool) && !this.gesture.active) this.gesture.rest();

      // Another level, a load, the players' view: what is under way goes
      if (pictureLeft) this.gesture.drop();

      // Fog changed (an edit, undo and redo, a load); nothing is drawn during a load, whose end
      // draws the fog. Under a gesture its preview is drawn again, on the fog as it now is. An
      // edit fades in; the fog of another map or level, or of a load, is there at once
      if (fogChanged) {
        if (this.gesture.active) this.gesture.refresh();
        else this.showCommitted(!mapChanged && !levelChanged && !loadingChanged);
      }

      if (loadingChanged) {
        if (state.isMapLoading) {
          this.container.visible = false;
          this.picture.endFade();
        } else {
          this.showCommitted();
        }
      }

      // The GM view switch: the fog takes the other view's opacity
      if (viewChanged) this.picture.followView();

      // An area that went (deleted, undone, another level) or a view that is no longer the GM's ends its renaming
      if (state.fogAreaPopover && !mayRenameFogArea(state, state.fogAreaPopover)) state.closeFogAreaPopover();
    });
  }
}
