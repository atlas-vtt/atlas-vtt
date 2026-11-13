/**
 * Fog coverage is drawn on one Canvas-backed sprite. Invisible per-operation
 * sprites retain the editing hit areas and selection/context-menu behavior.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { EventEmitter } from 'events';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import type { FogEdge } from '../../fog/fogEdge';
import { validateFogOperation } from '../../fog/fogOperationShape';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import type { FogCoverage } from '../../fog/fogCoverage';
import { fogStrokeReveals, isFogTool, type FogShape, type FogToolChoices } from '../../fog/fogToolChoices';
import { DEFAULT_GM_FOG_OPACITY } from '../../fog/gmFogOpacity';
import { FogCanvasCompositor } from './FogCanvasCompositor';
import { FogEdgeMesh } from './fogEdgeMesh';
import { FogCursorPreview } from './FogCursorPreview';
import { FogStrokeKeys } from './FogStrokeKeys';
import { FogOperationCanvas } from './FogOperationCanvas';
import { calculateOperationBounds } from './fogRenderUtils';
import { hitTestFogOp, findConnectedFogOps } from './fogHitTest';
import { extractConnectedComponentRects, fogWithErasers } from './fogComponentDelete';
import { canInteractWithFog, resolveFogPreviewAlpha } from './fogVisibilityPolicy';
import type { LayerVisibility } from '../playerSafeFrame';
import type { MapRect } from '../../grid/cellNumbering';
import { destroyTree } from '../utils/destroyTree';
import { requestRender } from '../RenderScheduler';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress, isSecondaryPress } from '../utils/pointerButtons';
import { openContextMenuGlobal } from '../../react/root/ContextMenuContext';
import { STROKE_COLORS, ShapeStroke, type StrokeMode } from '../../tools/shapeStroke';
import { drawStrokeArea } from '../utils/strokePreview';
import { t } from '../../i18n';
import { everyLevelObjects, levelObjects } from '../../levels/levelObjects';
import { levelMapKey, placedOnViewedLevel } from '../../levels/sceneLevels';

const DEFAULT_BOUNDS: FogBounds = { x: -2000, y: -2000, width: 4000, height: 4000 };
const BOUNDS_PADDING = 200;
const COMPONENT_DELETE_CELL_SIZE = 2;
const COMPONENT_DELETE_ALPHA_THRESHOLD = 12;
const COMPONENT_DELETE_MAX_RECTS = 320;
const EMPTY_FOG: Readonly<Record<string, FogOperation>> = Object.freeze({});
/** How wide a lasso's or rectangle's outline is while it is drawn, in screen pixels. */
const OUTLINE_PX = 2;

/** The stroke a shape is drawn with; the shapes that are no drag of the pointer have gestures of their own. */
function strokeModeOf(shape: FogShape): StrokeMode {
  return shape === 'rectangle' || shape === 'lasso' ? shape : 'brush';
}

interface FogSpriteEntry {
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
  opCanvas: FogOperationCanvas;
}


export class FogOfWarRenderer {
  // PIXI display objects
  private container: PIXI.Container;
  private previewSprite: PIXI.Sprite;
  /** Draws the fog's edge; there only while the fog has one. */
  private edgeMesh: FogEdgeMesh | null = null;
  private previewTexture: PIXI.Texture;
  private lassoGraphics: PIXI.Graphics;
  private rectPreviewGraphics: PIXI.Graphics;

  // Per-operation sprites (paint ops only)
  private fogSprites: Map<string, FogSpriteEntry> = new Map();

  // Committed coverage and temporary drawing preview
  private readonly coverageCache = new FogCoverageCache();
  private compositor: FogCanvasCompositor;
  private cursorPreview: FogCursorPreview;

  // Drawing state: the stroke under way, with the brush, lasso or rectangle
  private readonly stroke = new ShapeStroke();
  /** Alt is held: a stroke does the other of hiding and revealing. */
  private flipped = false;
  private readonly strokeKeys = new FogStrokeKeys(() => this._pixiApp.canvas, {
    flipped: (held) => this.setFlipped(held),
    dropped: () => this.dropStroke(),
  });
  /** How opaque the fog is in the GM's view (`setGmOpacity`). */
  private gmOpacity = DEFAULT_GM_FOG_OPACITY;

  // Store subscriptions
  private unsubscribe?: () => void;

  // Bound event handlers for cleanup
  private pointerDownHandler: (e: PIXI.FederatedPointerEvent) => void;
  private pointerMoveHandler: (e: PIXI.FederatedPointerEvent) => void;
  private pointerUpHandler: () => void;
  private readonly pointerLeaveHandler = (): void => this.onPointerLeave();
  private readonly mapImageUpdatedHandler = (): void => {
    if (!this.store.getState().isMapLoading) {
      this.refreshBounds();
      this.rebuildFogSprites();
    }
  };

  /**
   * @param mapRect the map image in world space, read whenever the fog sizes its canvas, so a
   * renamed scene or a load keeps the bounds of the image that is shown; `map-image-updated`
   * only says that it changed.
   */
  constructor(
    private viewport: Viewport,
    private _pixiApp: PIXI.Application,
    private eventBus: EventEmitter,
    private store: StoreApi<ViewAtlasState>,
    private readonly mapRect: () => MapRect | null,
  ) {
    // ── Container setup ─────────────────────────────────────────────
    this.container = new PIXI.Container();
    this.container.label = 'fogLayer';
    this.container.eventMode = 'none';
    this.container.sortableChildren = true;
    this.container.zIndex = 1000;
    this.container.interactiveChildren = false;

    // ── Coverage compositor + texture ────────────────────────────────
    const bounds = this.calculateFogBounds();
    this.compositor = new FogCanvasCompositor(bounds, 0.5, this.coverageCache, () => levelMapKey(this.store.getState().mapPath, this.store.getState()));

    this.previewTexture = PIXI.Texture.from(this.compositor.getCanvas());
    this.previewSprite = new PIXI.Sprite(this.previewTexture);
    this.previewSprite.position.set(bounds.x, bounds.y);
    this.previewSprite.width = bounds.width;
    this.previewSprite.height = bounds.height;
    this.previewSprite.alpha = this.fogAlpha();
    this.previewSprite.visible = false;
    this.previewSprite.eventMode = 'none';
    this.previewSprite.zIndex = 999; // Below per-op sprites during normal mode
    this.container.addChild(this.previewSprite);

    // ── Lasso & rectangle preview graphics ──────────────────────────
    this.lassoGraphics = new PIXI.Graphics();
    this.lassoGraphics.eventMode = 'none';
    this.lassoGraphics.zIndex = 1001;
    this.container.addChild(this.lassoGraphics);

    this.rectPreviewGraphics = new PIXI.Graphics();
    this.rectPreviewGraphics.eventMode = 'none';
    this.rectPreviewGraphics.zIndex = 1001;
    this.container.addChild(this.rectPreviewGraphics);

    // ── Cursor preview ──────────────────────────────────────────────
    this.cursorPreview = new FogCursorPreview(this.viewport);
    const cursorObj = this.cursorPreview.getDisplayObject();
    cursorObj.zIndex = 1002;
    this.container.addChild(cursorObj);

    // ── The tool's choices as the store holds them ───────────────────
    const { fogTool } = this.store.getState();
    this.stroke.mode = strokeModeOf(fogTool.shape);
    this.setBrushSize(fogTool.brushSize);

    // ── Bound handlers ──────────────────────────────────────────────
    this.pointerDownHandler = this.onPointerDown.bind(this);
    this.pointerMoveHandler = this.onPointerMove.bind(this);
    this.pointerUpHandler = this.onPointerUp.bind(this);

    // ── Event listeners ─────────────────────────────────────────────
    this.setupEventListeners();
    this.setupStoreSubscriptions();

    // Apply current store state immediately so preloaded fog is visible even
    // when no subsequent fog change event fires.
    this.applyInitialStoreState();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /** How the fog's edge looks, in every picture of the map. */
  setEdge(edge: FogEdge): void {
    this.compositor.setEdgeWidth(edge.width, this.mapRect);
    // The mesh's shader needs WebGL: elsewhere the sprite draws the canvas' blur, and every edge is soft
    if (edge.width > 0 && this._pixiApp.renderer.name === 'webgl') {
      if (this.edgeMesh) this.edgeMesh.setEdge(edge);
      else this.edgeMesh = new FogEdgeMesh(this.previewSprite, edge);
    } else {
      this.edgeMesh?.destroy();
      this.edgeMesh = null;
    }
    this.renderPreviewFromStore();
  }

  getContainer(): PIXI.Container {
    return this.container;
  }

  /** The committed shape drawn by the compositor; null means invalid geometry. */
  getCommittedCoverage(): FogCoverage | null {
    const state = this.store.getState();
    return this.coverageCache.get(levelObjects(state)?.fog ?? EMPTY_FOG, levelMapKey(state.mapPath, state));
  }

  /** Local player captures share the DM renderer but must not share its fog preview opacity. */
  getPlayerViewLayers(): LayerVisibility[] {
    return [
      { layer: this.previewSprite, visible: this.previewSprite.visible, alpha: 1 },
      { layer: this.cursorPreview.getDisplayObject(), visible: false },
      { layer: this.lassoGraphics, visible: false },
      { layer: this.rectPreviewGraphics, visible: false },
    ];
  }

  /** The fog as translucent as the GM view shows it, also while the canvas is in session view: for a picture of the scene. */
  getGmViewLayers(): LayerVisibility[] {
    return [{ layer: this.previewSprite, visible: this.previewSprite.visible, alpha: resolveFogPreviewAlpha({ isPlayerView: false, isGMView: true, gmOpacity: this.gmOpacity }) }];
  }

  /** How opaque the fog is in the GM's view, as the GM set it for this device. */
  setGmOpacity(opacity: number): void {
    if (opacity === this.gmOpacity) return;
    this.gmOpacity = opacity;
    this.previewSprite.alpha = this.fogAlpha();
    // The edge's shader applies the sprite's opacity itself, which the scene graph does not see
    requestRender(this._pixiApp);
  }

  /** How opaque the fog is drawn on this canvas now. */
  private fogAlpha(): number {
    const { isPlayerView, isGMView } = this.store.getState();
    return resolveFogPreviewAlpha({ isPlayerView, isGMView, gmOpacity: this.gmOpacity });
  }

  /** Returns a map of fog sprite IDs → Containers for SelectionManager. */
  getFogSprites(): Record<string, PIXI.Container> {
    const result: Record<string, PIXI.Container> = {};
    for (const [id, entry] of this.fogSprites) {
      result[id] = entry.sprite;
    }
    return result;
  }


  /** Returns the fog operation id if (worldX, worldY) hits any visible fog pixel, null otherwise. */
  public hitTestFog(worldX: number, worldY: number): string | null {
    if (!canInteractWithFog({ isPlayerView: this.store.getState().isPlayerView })) {
      return null;
    }
    const fogOps = levelObjects(this.store.getState())?.fog;
    if (!fogOps) return null;

    const allOps = Object.values(fogOps);
    const paintOps = allOps.filter((op) => !op.isErasing);

    for (const paintOp of paintOps) {
      if (hitTestFogOp(worldX, worldY, paintOp, allOps)) {
        return paintOp.id;
      }
    }
    return null;
  }

  /** Returns all fog op IDs that are part of the same visual region as `fogId`. */
  public findMergedFogGroup(fogId: string): string[] {
    const fogOps = levelObjects(this.store.getState())?.fog;
    if (!fogOps) return [fogId];
    const allOps = Object.values(fogOps);
    const paintOps = allOps.filter((op) => !op.isErasing);
    return findConnectedFogOps(fogId, paintOps, allOps);
  }

  /** Handles a viewport-routed click on a fog sprite (selection, context menu). */
  public handleViewportFogPointerDown(fogId: string, e: PIXI.FederatedPointerEvent): void {
    if (!canInteractWithFog({ isPlayerView: this.store.getState().isPlayerView })) {
      return;
    }
    e.stopPropagation();
    const groupIds = this.findMergedFogGroup(fogId);

    if (isSecondaryPress(e)) {
      this.showFogContextMenu(groupIds, e);
      return;
    }

    // Left-click → select the entire merged group
    this.store.getState().setSelection(groupIds);
  }
  enableFogMode(): void {
    if (this.store.getState().isMapLoading) return;
    this.container.eventMode = 'static';
    this.container.interactiveChildren = true;
    this.container.visible = true;

    // Disable interaction on hit-test sprites during drawing
    this.setFogSpritesInteractive(false);

    // Refresh compositor display with all committed ops
    this.refreshBounds();
    this.renderPreviewFromStore();
    this.previewSprite.visible = true;

    if (this.stroke.mode === 'brush') {
      this.cursorPreview.show(this.reveals());
    }
  }

  disableFogMode(): void {
    this.container.interactiveChildren = false;

    this.resetDrawingState();
    this.cursorPreview.hide();

    // Rebuild per-op hit-test sprites and refresh compositor display
    if (!this.store.getState().isMapLoading) {
      this.refreshBounds();
      this.rebuildFogSprites();
    }

    // Always disable sprite-level interactivity outside fog editing mode.
    // Viewport-level dispatch (via TokenRenderer) handles fog clicks instead.
    this.setFogSpritesInteractive(false);

    // Update container visibility
    const fogOps = levelObjects(this.store.getState())?.fog;
    if (!fogOps || Object.keys(fogOps).length === 0) {
      this.container.visible = false;
    } else {
      this.container.visible = true;
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    this.edgeMesh?.destroy();

    this.viewport.off('pointerdown', this.pointerDownHandler);
    this.viewport.off('pointermove', this.pointerMoveHandler);
    this.viewport.off('pointerup', this.pointerUpHandler);
    this.viewport.off('pointerupoutside', this.pointerUpHandler);
    this._pixiApp.canvas.removeEventListener('pointerleave', this.pointerLeaveHandler);
    this.strokeKeys.release();

    this.eventBus.off('map-image-updated', this.mapImageUpdatedHandler);

    this.cursorPreview.destroy();
    this.compositor.destroy();

    // Destroy per-op sprites
    for (const entry of this.fogSprites.values()) {
      entry.opCanvas.destroy();
      if (!entry.texture.destroyed) entry.texture.destroy(true);
      if (!entry.sprite.destroyed) entry.sprite.destroy();
    }
    this.fogSprites.clear();

    if (this.lassoGraphics && !this.lassoGraphics.destroyed) {
      this.lassoGraphics.destroy();
    }
    if (this.rectPreviewGraphics && !this.rectPreviewGraphics.destroyed) {
      this.rectPreviewGraphics.destroy();
    }
    if (this.previewTexture && !this.previewTexture.destroyed) {
      this.previewTexture.destroy(true);
    }
    if (this.container && !this.container.destroyed) {
      destroyTree(this.container);
    }
  }

  /** The tool's choices changed in its bar or by a key: the brush takes its size, and another shape drops the stroke under way. */
  private followFogTool(choices: FogToolChoices): void {
    this.setBrushSize(choices.brushSize);
    const mode = strokeModeOf(choices.shape);
    if (mode !== this.stroke.mode) this.setFogMode(mode);
  }

  private setBrushSize(size: number): void {
    this.stroke.brushRadius = size;
    this.cursorPreview.setBrushRadius(size);
  }

  setFogMode(mode: StrokeMode): void {
    this.dropStroke();
    this.stroke.mode = mode;

    if (isFogTool(this.store.getState().activeTool) && mode === 'brush') {
      this.cursorPreview.show(this.reveals());
    } else {
      this.cursorPreview.hide();
    }
  }

  /** Whether a stroke made now reveals: the revealing tool's does, and Alt turns either tool's around. */
  private reveals(): boolean {
    return fogStrokeReveals(this.store.getState().activeTool, this.flipped);
  }

  /** Alt went down or up: the ring and the stroke under way show what the stroke now does. */
  private setFlipped(held: boolean): void {
    if (held === this.flipped) return;
    this.flipped = held;
    if (this.cursorPreview.shown) this.cursorPreview.show(this.reveals());
    if (this.stroke.active) this.previewStroke();
  }

  /** Drops the stroke under way, leaving the fog as the store holds it. */
  private dropStroke(): void {
    const wasActive = this.stroke.active;
    this.resetDrawingState();
    if (wasActive && !this.store.getState().isMapLoading) {
      this.refreshBounds();
      this.rebuildFogSprites();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event wiring
  // ═══════════════════════════════════════════════════════════════════

  private setupEventListeners(): void {
    this.viewport.on('pointerdown', this.pointerDownHandler);
    this.viewport.on('pointermove', this.pointerMoveHandler);
    this.viewport.on('pointerup', this.pointerUpHandler);
    this.viewport.on('pointerupoutside', this.pointerUpHandler);
    this._pixiApp.canvas.addEventListener('pointerleave', this.pointerLeaveHandler);

    this.eventBus.on('map-image-updated', this.mapImageUpdatedHandler);
  }

  private setupStoreSubscriptions(): void {
    let prevTool = this.store.getState().activeTool;
    let prevFogTool = this.store.getState().fogTool;
    let prevFog = levelObjects(this.store.getState())?.fog;
    let prevLoading = this.store.getState().isMapLoading;
    let prevMapPath = this.store.getState().mapPath;
    let prevGMView = this.store.getState().isGMView;

    this.unsubscribe = this.store.subscribe((state) => {
      // Clear old pixels; coverage lookups synchronize their own map identity.
      const mapChanged = state.mapPath !== prevMapPath;
      if (mapChanged) {
        prevMapPath = state.mapPath;
        this.container.visible = false;
        this.resetDrawingState();
        this.clearAllFogSprites();
        this.compositor.clearCanvas();
      }

      // Tool changes → enable/disable fog mode or toggle interaction
      if (state.activeTool !== prevTool) {
        prevTool = state.activeTool;
        if (isFogTool(state.activeTool)) {
          this.enableFogMode();
        } else {
          this.disableFogMode();
        }
      }

      // The tool's choices (its bar, the brush's keys)
      if (state.fogTool !== prevFogTool) {
        prevFogTool = state.fogTool;
        this.followFogTool(state.fogTool);
      }

      // Fog data changes (undo/redo, map load, drag commit) → rebuild sprites
      // Skip while a stroke is under way: its preview is on the canvas
      // and during map loading (the isMapLoading→false handler rebuilds instead)
      if (levelObjects(state)?.fog !== prevFog || mapChanged) {
        prevFog = levelObjects(state)?.fog;
        if (!this.stroke.active && !state.isMapLoading) {
          this.refreshBounds();
          this.rebuildFogSprites();
        }
      }

      // Map loading completed → load fog
      if (state.isMapLoading !== prevLoading) {
        prevLoading = state.isMapLoading;
        if (state.isMapLoading) {
          this.container.visible = false;
        } else {
          this.refreshBounds();
          this.rebuildFogSprites();
        }
      }

      // GM view toggle → adjust fog opacity
      if (state.isGMView !== prevGMView) {
        prevGMView = state.isGMView;
        this.previewSprite.alpha = this.fogAlpha();
      }
    });
  }

  private applyInitialStoreState(): void {
    const state = this.store.getState();
    this.previewSprite.alpha = this.fogAlpha();

    if (state.isMapLoading) {
      this.container.visible = false;
      this.previewSprite.visible = false;
      return;
    }

    this.refreshBounds();
    this.rebuildFogSprites();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Per-operation sprite management
  // ═══════════════════════════════════════════════════════════════════

  /** Rebuild all per-operation sprites from store. */
  private rebuildFogSprites(): void {
    try {
      const fogOps = levelObjects(this.store.getState())?.fog;
      const allOps = fogOps ? Object.values(fogOps) : [];
      // Prepare the committed picture before an editing proxy can fail.
      const rendered = this.renderPreviewFromStore();
      const tool = this.store.getState().activeTool;
      this.previewSprite.visible = allOps.length > 0 || !rendered;
      this.container.visible = this.previewSprite.visible || tool === 'fog' || tool === 'eraser';
      if (!rendered) {
        this.clearAllFogSprites();
        return;
      }
      const paintOps = allOps.filter((op) => !op.isErasing);
      const eraseOps = allOps.filter((op) => op.isErasing);

      // Track which IDs are still in the store
      const currentIds = new Set(paintOps.map((op) => op.id));

      // Remove sprites for deleted operations
      for (const [id, entry] of this.fogSprites) {
        if (!currentIds.has(id)) {
          entry.opCanvas.destroy();
          if (!entry.texture.destroyed) entry.texture.destroy(true);
          if (!entry.sprite.destroyed) {
            this.container.removeChild(entry.sprite);
            entry.sprite.destroy();
          }
          this.fogSprites.delete(id);
        }
      }

      // Create or update hit-test sprites for each paint operation
      for (const paintOp of paintOps) {
        const bounds = calculateOperationBounds(paintOp);
        if (bounds.width <= 0 || bounds.height <= 0) continue;

        const existing = this.fogSprites.get(paintOp.id);
        if (existing) {
          existing.opCanvas.destroy();
          if (!existing.texture.destroyed) existing.texture.destroy(true);

          const opCanvas = new FogOperationCanvas(paintOp, eraseOps);
          const wb = opCanvas.getWorldBounds();
          const texture = PIXI.Texture.from(opCanvas.getCanvas());

          existing.sprite.texture = texture;
          existing.sprite.position.set(wb.x, wb.y);
          existing.sprite.width = wb.width;
          existing.sprite.height = wb.height;
          existing.texture = texture;
          existing.opCanvas = opCanvas;
        } else {
          this.createFogSprite(paintOp, eraseOps);
        }
      }

      // Sprites stay non-interactive; viewport-level dispatch handles fog clicks.
      this.setFogSpritesInteractive(false);
    } catch (error) {
      console.error('[FogOfWarRenderer] Error rebuilding fog sprites:', error);
    }
  }

  private createFogSprite(paintOp: FogOperation, eraseOps: FogOperation[]): void {
    const bounds = calculateOperationBounds(paintOp);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const opCanvas = new FogOperationCanvas(paintOp, eraseOps);
    const wb = opCanvas.getWorldBounds();
    const texture = PIXI.Texture.from(opCanvas.getCanvas());

    const sprite = new PIXI.Sprite(texture);
    sprite.position.set(wb.x, wb.y);
    sprite.width = wb.width;
    sprite.height = wb.height;
    sprite.alpha = 0; // Invisible hit-test proxy — display via compositor
    sprite.zIndex = paintOp.timestamp;
    sprite.label = `fog_${paintOp.id}`;
    sprite.eventMode = 'none';

    this.container.addChild(sprite);
    this.fogSprites.set(paintOp.id, { sprite, texture, opCanvas });
  }

  private clearAllFogSprites(): void {
    for (const entry of this.fogSprites.values()) {
      entry.opCanvas.destroy();
      if (!entry.texture.destroyed) entry.texture.destroy(true);
      if (!entry.sprite.destroyed) {
        this.container.removeChild(entry.sprite);
        entry.sprite.destroy();
      }
    }
    this.fogSprites.clear();
  }

  private setFogSpritesInteractive(interactive: boolean): void {
    for (const [, entry] of this.fogSprites) {
      entry.sprite.eventMode = interactive ? 'static' : 'none';
      entry.sprite.cursor = interactive ? 'pointer' : 'default';
      entry.sprite.off('pointerdown');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fog sprite interaction (select / drag / context menu)
  // ═══════════════════════════════════════════════════════════════════

  private onFogSpritePointerDown(e: PIXI.FederatedPointerEvent, fogId: string): void {
    e.stopPropagation();
    const groupIds = this.findMergedFogGroup(fogId);

    if (isSecondaryPress(e)) {
      this.showFogContextMenu(groupIds, e);
      return;
    }

    // Left-click → select the entire merged group
    this.store.getState().setSelection(groupIds);
  }

  private showFogContextMenu(fogIds: string[], e: PIXI.FederatedPointerEvent): void {
    const worldPos = this.viewport.toWorld(e.global);
    openContextMenuGlobal([{
      type: 'item',
      label: t('common.delete'),
      icon: 'trash',
      destructive: true,
      onClick: () => {
        const erased = this.eraseConnectedVisibleRegionAt(worldPos.x, worldPos.y);
        if (!erased) {
          this.store.getState().deleteFogOperations(fogIds);
        }
      },
    }], { x: e.clientX, y: e.clientY });
  }

  private eraseConnectedVisibleRegionAt(worldX: number, worldY: number): boolean {
    const eraseRects = this.computeComponentEraseRects(worldX, worldY);
    this.renderPreviewFromStore();
    if (eraseRects.length === 0) {
      return false;
    }

    const state = this.store.getState();
    const nextFog = fogWithErasers(everyLevelObjects(state).fog, eraseRects, Date.now(), placedOnViewedLevel(state));
    if (nextFog === null) {
      return false;
    }
    state.setFogOperations(nextFog);
    return true;
  }

  private computeComponentEraseRects(worldX: number, worldY: number): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    // The current fog as its shapes are: a faded edge would join pieces and reach past them.
    this.renderPreviewFromStore(false);

    const canvas = this.compositor.getCanvas();
    const bounds = this.compositor.getBounds();
    if (canvas.width <= 0 || canvas.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
      return [];
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return [];
    }

    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const seedCanvasX = Math.floor((worldX - bounds.x) * scaleX);
    const seedCanvasY = Math.floor((worldY - bounds.y) * scaleY);

    if (
      seedCanvasX < 0 ||
      seedCanvasY < 0 ||
      seedCanvasX >= canvas.width ||
      seedCanvasY >= canvas.height
    ) {
      return [];
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const seedAlpha = imageData[(seedCanvasY * canvas.width + seedCanvasX) * 4 + 3] ?? 0;
    if (seedAlpha <= COMPONENT_DELETE_ALPHA_THRESHOLD) {
      return [];
    }

    const coarseW = Math.ceil(canvas.width / COMPONENT_DELETE_CELL_SIZE);
    const coarseH = Math.ceil(canvas.height / COMPONENT_DELETE_CELL_SIZE);
    const mask = new Uint8Array(coarseW * coarseH);

    for (let gy = 0; gy < coarseH; gy++) {
      for (let gx = 0; gx < coarseW; gx++) {
        const startX = gx * COMPONENT_DELETE_CELL_SIZE;
        const startY = gy * COMPONENT_DELETE_CELL_SIZE;
        const endX = Math.min(canvas.width, startX + COMPONENT_DELETE_CELL_SIZE);
        const endY = Math.min(canvas.height, startY + COMPONENT_DELETE_CELL_SIZE);
        let occupied = 0;
        for (let py = startY; py < endY && occupied === 0; py++) {
          for (let px = startX; px < endX; px++) {
            const alpha = imageData[(py * canvas.width + px) * 4 + 3] ?? 0;
            if (alpha > COMPONENT_DELETE_ALPHA_THRESHOLD) {
              occupied = 1;
              break;
            }
          }
        }
        mask[gy * coarseW + gx] = occupied;
      }
    }

    const seedCoarseX = Math.floor(seedCanvasX / COMPONENT_DELETE_CELL_SIZE);
    const seedCoarseY = Math.floor(seedCanvasY / COMPONENT_DELETE_CELL_SIZE);
    const coarseRects = extractConnectedComponentRects(mask, coarseW, coarseH, seedCoarseX, seedCoarseY);
    if (coarseRects.length === 0 || coarseRects.length > COMPONENT_DELETE_MAX_RECTS) {
      return [];
    }

    const worldPerCanvasX = bounds.width / canvas.width;
    const worldPerCanvasY = bounds.height / canvas.height;

    return coarseRects.map((rect) => {
      const canvasStartX = rect.x * COMPONENT_DELETE_CELL_SIZE;
      const canvasStartY = rect.y * COMPONENT_DELETE_CELL_SIZE;
      const canvasEndX = Math.min(canvas.width, (rect.x + rect.width) * COMPONENT_DELETE_CELL_SIZE);
      const canvasEndY = Math.min(canvas.height, (rect.y + rect.height) * COMPONENT_DELETE_CELL_SIZE);
      return {
        x: bounds.x + canvasStartX * worldPerCanvasX,
        y: bounds.y + canvasStartY * worldPerCanvasY,
        width: (canvasEndX - canvasStartX) * worldPerCanvasX,
        height: (canvasEndY - canvasStartY) * worldPerCanvasY,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Drawing pointer handlers (fog/eraser tool)
  // ═══════════════════════════════════════════════════════════════════

  /** The fog tools hear presses after the dispatch that claims them; called once that dispatch listens. */
  public reorderViewportListeners(): void {
    hearPressesLast(this.viewport, this.pointerDownHandler);
  }

  private onPointerDown(event: PIXI.FederatedPointerEvent): void {
    if (!isFogTool(this.store.getState().activeTool)) return;
    // Only the primary button paints; the right button pans the map.
    if (!isPrimaryPress(event)) return;
    // A press a pin, door badge or light marker took paints no fog.
    if (isHandled(event)) return;

    this.previewSprite.visible = true;
    this.setFlipped(event.altKey === true);
    this.stroke.begin(this.strokePoint(event));
    this.strokeKeys.hold();
    this.previewStroke();
  }

  /** Where the pointer is on the map; a rectangle's corners snap to the grid's. */
  private strokePoint(event: PIXI.FederatedPointerEvent): { x: number; y: number } {
    const { x, y } = this.viewport.toWorld(event.global);
    return this.stroke.mode === 'rectangle' ? this.snapToGridCorner(x, y) : { x, y };
  }

  private snapToGridCorner(x: number, y: number): { x: number; y: number } {
    const grid = this.store.getState().grid;
    if (!grid?.size) return { x, y };
    const { size, offsetX = 0, offsetY = 0 } = grid;
    return {
      x: Math.round((x - offsetX) / size) * size + offsetX,
      y: Math.round((y - offsetY) / size) * size + offsetY,
    };
  }

  private onPointerMove(event: PIXI.FederatedPointerEvent): void {
    const fogTool = isFogTool(this.store.getState().activeTool);
    // Alt pressed or let go while the map had no key focus is told by the pointer.
    if (fogTool) this.setFlipped(event.altKey === true);

    if (this.stroke.mode === 'brush' && fogTool) {
      const worldPos = this.viewport.toWorld(event.global);
      this.cursorPreview.updatePosition(worldPos.x, worldPos.y);
      // Back on the map after the pointer had left it.
      if (!this.cursorPreview.shown) this.cursorPreview.show(this.reveals());
    }

    if (!this.stroke.active) return;
    this.stroke.extend(this.strokePoint(event));
    this.previewStroke();
  }

  /** The pointer left the map's canvas: the brush's ring would stay where it last was. */
  private onPointerLeave(): void {
    this.cursorPreview.hide();
  }

  private onPointerUp(): void {
    if (!this.stroke.active) return;
    const shape = this.stroke.finish();
    this.strokeKeys.release();
    this.clearPreviewGraphics();
    if (shape) this.store.getState().addFogOperation({ ...shape, isErasing: this.reveals() });
    else if (!this.store.getState().isMapLoading) {
      this.refreshBounds();
      this.rebuildFogSprites();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Preview helpers (live visual feedback during drawing)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Shows the stroke under way as the fog it will leave: hidden or revealed on the fog itself,
   * whatever the shape. A lasso and a rectangle also show their outline, which tells the shape
   * where it hides what is hidden already.
   */
  private previewStroke(): void {
    const reveals = this.reveals();
    const shape = this.stroke.shape();
    const committed = levelObjects(this.store.getState())?.fog ?? EMPTY_FOG;
    // No shape yet (a lasso of two points, a rectangle without a size) shows the fog as it is
    const preview: FogOperation | undefined = shape ? { id: '__preview__', kind: 'fog', timestamp: Date.now(), isErasing: reveals, ...shape } : undefined;
    this.compositor.composite(committed, preview);
    this.updatePreviewTexture();
    if (this.stroke.mode === 'brush') return;
    const outline = this.stroke.mode === 'lasso' ? this.lassoGraphics : this.rectPreviewGraphics;
    drawStrokeArea(outline, this.stroke, reveals ? STROKE_COLORS.erase : STROKE_COLORS.paint, OUTLINE_PX / this.viewport.scale.x, false);
  }

  private renderPreviewFromStore(fadeEdge = true): boolean {
    const ops = levelObjects(this.store.getState())?.fog ?? EMPTY_FOG;
    const rendered = this.compositor.composite(ops, undefined, fadeEdge);
    this.updatePreviewTexture();
    return rendered;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Texture update
  // ═══════════════════════════════════════════════════════════════════

  private updatePreviewTexture(): void {
    if (this.previewTexture && !this.previewTexture.destroyed) {
      this.previewTexture.source.update();
      // New pixels in an existing texture are invisible to the scene graph
      requestRender(this._pixiApp);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Bounds calculation
  // ═══════════════════════════════════════════════════════════════════

  private calculateFogBounds(): FogBounds {
    // Without a map image (none loaded yet) the fog covers what was painted, or a default area.
    const chosen = this.mapRect() ?? this.calculateFogOpsBoundsCandidate();
    if (!chosen) {
      return DEFAULT_BOUNDS;
    }

    return {
      x: chosen.x - BOUNDS_PADDING,
      y: chosen.y - BOUNDS_PADDING,
      width: chosen.width + BOUNDS_PADDING * 2,
      height: chosen.height + BOUNDS_PADDING * 2,
    };
  }

  private calculateFogOpsBoundsCandidate():
    | {
        x: number;
        y: number;
        width: number;
        height: number;
        area: number;
        source: string;
      }
    | null {
    const fog = levelObjects(this.store.getState())?.fog;
    if (!fog) {
      return null;
    }

    const ops = Object.values(fog);
    try {
      ops.forEach(validateFogOperation);
    } catch {
      // Use the map bounds so invalid saved geometry can reach the opaque fallback.
      return null;
    }
    if (ops.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const op of ops) {
      if (op.isErasing) continue;
      const bounds = calculateOperationBounds(op);
      if (bounds.width <= 0 || bounds.height <= 0) {
        continue;
      }
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
      x: minX,
      y: minY,
      width,
      height,
      area: width * height,
      source: `fog-ops:${ops.length}`,
    };
  }

  private refreshBounds(): void {
    const newBounds = this.calculateFogBounds();
    const oldBounds = this.compositor.getBounds();

    if (
      Math.abs(newBounds.x - oldBounds.x) > 10 ||
      Math.abs(newBounds.y - oldBounds.y) > 10 ||
      Math.abs(newBounds.width - oldBounds.width) > 10 ||
      Math.abs(newBounds.height - oldBounds.height) > 10
    ) {
      this.compositor.updateBounds(newBounds);

      if (this.previewTexture && !this.previewTexture.destroyed) {
        this.previewTexture.destroy(true);
      }
      this.previewTexture = PIXI.Texture.from(this.compositor.getCanvas());
      this.previewSprite.texture = this.previewTexture;
      this.previewSprite.position.set(newBounds.x, newBounds.y);
      this.previewSprite.width = newBounds.width;
      this.previewSprite.height = newBounds.height;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  private resetDrawingState(): void {
    this.stroke.cancel();
    this.strokeKeys.release();
    this.clearPreviewGraphics();
  }

  private clearPreviewGraphics(): void {
    if (this.lassoGraphics && !this.lassoGraphics.destroyed) {
      this.lassoGraphics.clear();
    }
    if (this.rectPreviewGraphics && !this.rectPreviewGraphics.destroyed) {
      this.rectPreviewGraphics.clear();
    }
  }
}
