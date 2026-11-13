/**
 * The fog of a map view: owns the fog's layer, its picture (`FogPicture`) and the fog tool's
 * gesture (`FogGesture`), and says when the picture follows the scene. Fog takes presses only
 * while the fog tool is chosen.
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
import { levelMapKey } from '../../levels/sceneLevels';
import { FogGesture } from './FogGesture';
import { FogPicture, viewedFog } from './FogPicture';

export class FogOfWarRenderer {
  private readonly container: PIXI.Container;
  /** The committed shapes, shared by the picture and by whoever asks what the fog covers. */
  private readonly coverageCache = new FogCoverageCache();
  private readonly picture: FogPicture;
  private readonly gesture: FogGesture;
  private unsubscribe?: () => void;

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

    this.picture = new FogPicture({ layer: this.container, app: pixiApp, store, mapRect, coverage: this.coverageCache });
    this.gesture = new FogGesture({
      layer: this.container,
      viewport,
      canvas: () => pixiApp.canvas,
      store,
      host: {
        showStroke: (stroke) => this.picture.drawStroke(stroke),
        showCommitted: () => this.showCommitted(),
      },
    });

    this.eventBus.on('map-image-updated', this.mapImageUpdatedHandler);
    this.followStore();

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
    return [...this.picture.playerLayers(), ...this.gesture.playerLayers()];
  }

  /** The fog as translucent as the GM view shows it, also while the canvas is in session view: for a picture of the scene. */
  getGmViewLayers(): LayerVisibility[] {
    return this.picture.gmLayers();
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
    this.container.visible = Object.keys(viewedFog(this.store.getState())).length > 0;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.eventBus.off('map-image-updated', this.mapImageUpdatedHandler);
    this.gesture.destroy();
    this.picture.destroy();
    if (!this.container.destroyed) destroyTree(this.container);
  }

  /**
   * Draws the fog as the scene holds it, on a canvas of the map's size; nothing during a load,
   * whose end draws it. The layer shows while there is fog, or the fog tool to make some.
   */
  private showCommitted(): void {
    const state = this.store.getState();
    if (state.isMapLoading) return;
    this.picture.fit();
    const rendered = this.picture.drawCommitted();
    // Geometry that cannot be drawn hides the whole map
    this.picture.sprite.visible = Object.keys(viewedFog(state)).length > 0 || !rendered;
    this.container.visible = this.picture.sprite.visible || isFogTool(state.activeTool);
  }

  private followStore(): void {
    let previous = this.store.getState();
    let prevFog = viewedFog(previous);

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
      const fog = viewedFog(state);
      const fogChanged = fog !== prevFog || mapChanged;
      previous = state;
      prevFog = fog;

      if (toolChanged) {
        if (isFogTool(state.activeTool)) this.enableFogMode();
        else this.disableFogMode();
      }

      // The tool's choices (its bar, the brush's keys)
      if (choicesChanged) this.gesture.follow(state.fogTool);

      // Fog changed (an edit, undo and redo, a load): not while a stroke is under way, whose
      // preview is on the canvas, and not during a load, whose end draws the fog
      if (fogChanged && !this.gesture.active) this.showCommitted();

      if (loadingChanged) {
        if (state.isMapLoading) this.container.visible = false;
        else this.showCommitted();
      }

      // The GM view switch: the fog takes the other view's opacity
      if (viewChanged) this.picture.followView();
    });
  }
}
