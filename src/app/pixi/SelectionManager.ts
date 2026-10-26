import { Graphics, Rectangle, Container, FederatedPointerEvent } from "pixi.js";
import { Viewport } from "pixi-viewport";
// For Token Sprite type if needed
import { getObsidianAccentColor, cssColorToHexNumber } from "./utils/colorUtils";
import { isHandled } from "./utils/handledEvents";
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { EventEmitter } from 'events';
import { getDrawingBounds, type DrawingBounds } from './drawingGeometry';
import { SelectionHighlights } from './selection/SelectionHighlights';
import { NO_BARS, selectionTargets } from './selection/selectionTargets';
import type { BarsSpan } from './token-renderer/types';
import { prefersReducedMotion } from '../utils/motion';
import type { LayerVisibility } from './playerSafeFrame';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { pointInPolygon } from '../vision/visibility';
import { GroupRotation, type GroupTurnHost } from './selection/GroupRotation';
import { mapTokens } from '../tokens/offMap';

export class SelectionManager {
  private viewport: Viewport;
  private tokenRendererProvider: () => ({ [id: string]: Container });
  /** How far a selected token's bars stand out from it, in world units; a group's frame encloses them. */
  public barsProvider: (tokenId: string) => BarsSpan = () => NO_BARS;
  private fogSpriteProvider: () => ({ [id: string]: Container });
  private hitTestTokensProvider?: (worldX: number, worldY: number) => string | null;

  private readonly highlights: SelectionHighlights;
  private readonly groupRotation: GroupRotation;
  private groupTurnHost: GroupTurnHost | null = null;
  private marqueeGraphics: Graphics;
  private selectionStart: { x: number; y: number } | null = null;
  private selectionMode: 'box' | 'lasso' = 'box';
  private mapLoadedHandler: (() => void) | null = null;
  private lassoPoints: { x: number; y: number }[] = [];

  private _unsubscribeFromSelectionChanges?: () => void;
  private _unsubscribeFromToolChanges?: () => void;
  private _unsubscribeFromDrawingChanges?: () => void;
  private _unsubscribeFromSelectionMode?: () => void;
  private store: ViewAtlasStore;
  private eventBus: EventEmitter;

  // Store handlers to remove them correctly
  private marqueeDownHandler: (e: FederatedPointerEvent) => void;
  private marqueeMoveHandler: (e: FederatedPointerEvent) => void;
  private marqueeUpHandler: (e: FederatedPointerEvent) => void;

  constructor(
    viewport: Viewport,
    tokenRendererProvider: () => ({ [id: string]: Container }),
    fogSpriteProvider: () => ({ [id: string]: Container }),
    store: ViewAtlasStore,
    eventBus: EventEmitter
  ) {
    this.viewport = viewport;
    this.tokenRendererProvider = tokenRendererProvider;
    this.fogSpriteProvider = fogSpriteProvider;
    this.store = store;
    this.eventBus = eventBus;

    this.marqueeGraphics = new Graphics();
    this.marqueeGraphics.zIndex = MAP_LAYER_Z.selection;
    this.viewport.addChild(this.marqueeGraphics);

    this.highlights = new SelectionHighlights({
      viewport,
      reducedMotion: () => typeof window === 'undefined' || prefersReducedMotion(viewport.options?.events?.domElement ?? document.body),
      accent: () => cssColorToHexNumber(getObsidianAccentColor()),
      refresh: () => this.updateSelectionOverlay(),
    });
    // Beneath the marquee
    this.viewport.addChildAt(this.highlights.layer, this.viewport.getChildIndex(this.marqueeGraphics));
    this.groupRotation = new GroupRotation({
      viewport,
      store,
      host: () => this.groupTurnHost,
      frame: () => this.highlights.groupFrameBox(),
      turnFrame: (turn) => this.highlights.turnGroup(turn),
      refresh: () => this.updateSelectionOverlay(),
      accent: () => cssColorToHexNumber(getObsidianAccentColor()),
      reducedMotion: () => typeof window === 'undefined' || prefersReducedMotion(viewport.options?.events?.domElement ?? document.body),
    });
    this.viewport.addChild(this.groupRotation.layer);

    this.marqueeDownHandler = this.handleMarqueeStart.bind(this);
    this.marqueeMoveHandler = this.handleMarqueeMove.bind(this);
    this.marqueeUpHandler = this.handleMarqueeEnd.bind(this);

    this.subscribeToStoreChanges();
    this.updateSelectionOverlay(); // Initial draw
    
    // Subscribe to selection mode changes from the store
    this._unsubscribeFromSelectionMode = this.store.subscribe(
      (state: ViewAtlasState) => state.selectionMode,
      (mode: 'box' | 'lasso') => {
        this.selectionMode = mode;
      },
      { fireImmediately: true }
    );
    
    // Listen for map load events to clear selection
    this.mapLoadedHandler = () => {
      // A group turned on the scene that was there is let go of: nothing of it is written into this one
      this.groupRotation.drop();
      // Clear selection state
      this.store.getState().clearSelection();
      // Clear any active marquee
      if (this.marqueeGraphics && !this.marqueeGraphics.destroyed) {
        this.marqueeGraphics.clear();
      }
      this.selectionStart = null;
      this.lassoPoints = [];
    };
    
    this.eventBus.on('map-loaded', this.mapLoadedHandler);
  }

  public setHitTestTokensProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.hitTestTokensProvider = fn;
  }

  /** What turns the tokens of a group turned from the button above its frame; without one there is no button. */
  public setGroupTurnHost(host: GroupTurnHost): void {
    this.groupTurnHost = host;
    this.updateSelectionOverlay();
  }

  /** Escape cancels a group being turned; whether it did. */
  public handleEscape(): boolean {
    return this.groupRotation.cancel();
  }

  private subscribeToStoreChanges(): void {
    this._unsubscribeFromSelectionChanges = this.store.subscribe(
      (state: ViewAtlasState) => state.selectedIds, // Only listen to selected IDs changes
      () => this.updateSelectionOverlay(),
      { fireImmediately: true }
    );

    // Dragged or undone drawings move without the selection changing
    this._unsubscribeFromDrawingChanges = this.store.subscribe(
      (state: ViewAtlasState) => state.objects.drawings,
      () => this.updateSelectionOverlay()
    );

    this._unsubscribeFromToolChanges = this.store.subscribe(
      (state: ViewAtlasState) => state.activeTool,
      (tool: string) => {
        // Enable marquee selection for both 'move' and 'select' tools
        if (tool === 'select' || tool === 'move') {
          // Switching between the two must not add the handlers a second time
          this.viewport.off('pointerdown', this.marqueeDownHandler);
          this.viewport.off('pointermove', this.marqueeMoveHandler);
          this.viewport.off('pointerup', this.marqueeUpHandler);
          this.viewport.off('pointerupoutside', this.marqueeUpHandler);
          this.viewport.on('pointerdown', this.marqueeDownHandler);
          this.viewport.on('pointermove', this.marqueeMoveHandler);
          this.viewport.on('pointerup', this.marqueeUpHandler);
          this.viewport.on('pointerupoutside', this.marqueeUpHandler);
        } else {
          this.viewport.off('pointerdown', this.marqueeDownHandler);
          this.viewport.off('pointermove', this.marqueeMoveHandler);
          this.viewport.off('pointerup', this.marqueeUpHandler);
          this.viewport.off('pointerupoutside', this.marqueeUpHandler);
          if (this.marqueeGraphics && !this.marqueeGraphics.destroyed) {
            this.marqueeGraphics.clear();
          }
          this.selectionStart = null; // Clear selection state if tool changes
        }
        // The group's rotate button is offered with the tools that move the selection
        this.updateSelectionOverlay();
      },
      { fireImmediately: true }
    );
  }

  private handleMarqueeStart(e: FederatedPointerEvent): void {
    const activeTool = this.store.getState().activeTool;
    if (activeTool !== 'select' && activeTool !== 'move') return;
    
    // Only handle left mouse button (button 0) for marquee selection
    if (e.button !== 0) return;

    // Skip if another handler already claimed this event (e.g. token or fog click)
    if (isHandled(e)) return;
    
    // Don't start marquee if clicking on a token (geometry-based fallback)
    const worldPos = this.viewport.toWorld(e.global);
    if (this.hitTestTokensProvider) {
      if (this.hitTestTokensProvider(worldPos.x, worldPos.y) != null) {
        return;
      }
    } else {
      // Fallback to display-tree walking
      const target = e.target;
      if (target instanceof Container && this.isTargetPartOfToken(target)) {
        return;
      }
    }
    
    e.stopPropagation(); // Prevent viewport drag for left-click marquee
    this.selectionStart = { x: worldPos.x, y: worldPos.y };
    this.marqueeGraphics.clear();
    
    // Initialize lasso points if in lasso mode
    if (this.selectionMode === 'lasso') {
      this.lassoPoints = [{ x: worldPos.x, y: worldPos.y }];
    }
    this.updateSelectionOverlay();
  }

  private handleMarqueeMove(e: FederatedPointerEvent): void {
    const activeTool = this.store.getState().activeTool;
    if (!this.selectionStart || (activeTool !== 'select' && activeTool !== 'move')) return;
    e.stopPropagation();
    const worldPos = this.viewport.toWorld(e.global);
    
    // Safety check - ensure marquee graphics exist and haven't been destroyed
    if (!this.marqueeGraphics || this.marqueeGraphics.destroyed) {
      console.warn('[SelectionManager] Marquee graphics not available or has been destroyed');
      return;
    }
    
    this.marqueeGraphics.clear();
    const accentHex = cssColorToHexNumber(getObsidianAccentColor());
    
    if (this.selectionMode === 'lasso') {
      this.lassoPoints.push({ x: worldPos.x, y: worldPos.y });

      if (this.lassoPoints.length < 2) return;
      const first = this.lassoPoints[0]!;
      this.marqueeGraphics.moveTo(first.x, first.y);
      for (let i = 1; i < this.lassoPoints.length; i++) {
        const p = this.lassoPoints[i]!;
        this.marqueeGraphics.lineTo(p.x, p.y);
      }
      this.marqueeGraphics.closePath();
      this.paintMarquee(accentHex);
    } else {
      // Box selection mode
      const sx = Math.min(this.selectionStart.x, worldPos.x);
      const sy = Math.min(this.selectionStart.y, worldPos.y);
      const sw = Math.abs(worldPos.x - this.selectionStart.x);
      const sh = Math.abs(worldPos.y - this.selectionStart.y);
      
      this.marqueeGraphics.roundRect(sx, sy, sw, sh, 4 / this.zoom());
      this.paintMarquee(accentHex);
    }
  }

  private zoom(): number {
    return this.viewport.scale.x || 1;
  }

  /** The marquee and lasso in the selection's language: a thin accent line of one screen pixel over a faint wash. */
  private paintMarquee(accent: number): void {
    this.marqueeGraphics.fill({ color: accent, alpha: 0.08 });
    this.marqueeGraphics.stroke({ width: 1 / this.zoom(), color: accent, alpha: 0.9 });
  }

  private handleMarqueeEnd(e: FederatedPointerEvent): void {
    const activeTool = this.store.getState().activeTool;
    if (!this.selectionStart || (activeTool !== 'select' && activeTool !== 'move')) return;
    e.stopPropagation();
    const worldPos = this.viewport.toWorld(e.global);
    
    const selectedIds: string[] = [];
    const tokenSprites = this.tokenRendererProvider(); // Get current token sprites
    
    const fogSprites = this.fogSpriteProvider();

    if (this.selectionMode === 'lasso' && this.lassoPoints.length > 2) {
      // Complete the lasso path
      const firstPoint = this.lassoPoints[0];
      if (firstPoint) {
        this.lassoPoints.push({ x: firstPoint.x, y: firstPoint.y });
      }

      // Check which tokens are inside the lasso polygon; a token the canvas hides (session view) is not selectable
      for (const [id, tokenGroup] of Object.entries(tokenSprites)) {
        if (tokenGroup?.visible) {
          const tokenX = tokenGroup.position.x;
          const tokenY = tokenGroup.position.y;

          if (pointInPolygon({ x: tokenX, y: tokenY }, this.lassoPoints)) {
            selectedIds.push(id);
          }
        }
      }

      for (const [id, bounds] of this.getDrawingBoundsById()) {
        if (pointInPolygon({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, this.lassoPoints)) {
          selectedIds.push(id);
        }
      }

      // Check fog sprites (use center of bounds)
      for (const [id, fogSprite] of Object.entries(fogSprites)) {
        if (fogSprite) {
          const bounds = fogSprite.getBounds();
          const cx = bounds.x + bounds.width / 2;
          const cy = bounds.y + bounds.height / 2;
          if (pointInPolygon({ x: cx, y: cy }, this.lassoPoints)) {
            selectedIds.push(id);
          }
        }
      }
    } else {
      // Box selection mode
      const selectionRect = new Rectangle(
        Math.min(this.selectionStart.x, worldPos.x),
        Math.min(this.selectionStart.y, worldPos.y),
        Math.abs(worldPos.x - this.selectionStart.x),
        Math.abs(worldPos.y - this.selectionStart.y)
      );

      for (const [id, tokenGroup] of Object.entries(tokenSprites)) {
        if (tokenGroup?.visible) {
          const halfSize = 35;
          const tokenBounds = {
            x: tokenGroup.position.x - halfSize,
            y: tokenGroup.position.y - halfSize,
            width: halfSize * 2,
            height: halfSize * 2
          };
          const tokenRect = new Rectangle(tokenBounds.x, tokenBounds.y, tokenBounds.width, tokenBounds.height);
          if (selectionRect.intersects(tokenRect) || selectionRect.contains(tokenRect.x, tokenRect.y)) {
            selectedIds.push(id);
          }
        }
      }

      for (const [id, bounds] of this.getDrawingBoundsById()) {
        if (selectionRect.intersects(new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height))) {
          selectedIds.push(id);
        }
      }

      // Check fog sprites
      for (const [id, fogSprite] of Object.entries(fogSprites)) {
        if (fogSprite) {
          const b = fogSprite.getBounds();
          const fogRect = new Rectangle(b.x, b.y, b.width, b.height);
          if (selectionRect.intersects(fogRect)) {
            selectedIds.push(id);
          }
        }
      }
    }
    
    if (this.marqueeGraphics && !this.marqueeGraphics.destroyed) {
      this.marqueeGraphics.clear();
    }
    this.selectionStart = null;
    this.lassoPoints = [];
    // The store subscription shows the new selection, now without a marquee under way
    this.store.getState().setSelection(selectedIds);
  }
  
  private getDrawingBoundsById(): Array<[string, DrawingBounds]> {
    const entries: Array<[string, DrawingBounds]> = [];
    for (const stroke of Object.values(this.store.getState().objects.drawings)) {
      const bounds = getDrawingBounds(stroke);
      if (bounds) entries.push([stroke.id, bounds]);
    }
    return entries;
  }

  // Helper method to check if a target is part of a token hierarchy
  private isTargetPartOfToken(target: Container): boolean {
    // Fallback: walk the display hierarchy (used if hitTestTokensProvider is not set)
    let current: Container | null = target;
    let depth = 0;
    const maxDepth = 10;
    
    while (current && depth < maxDepth) {
      if (current.label === 'tokenGroup') return true;
      if (current.parent?.label === 'tokenGroup') return true;
      current = current.parent;
      depth++;
    }
    
    return false;
  }

  /** Whether a press at the world point lands inside the frame drawn around a selection of two or more. */
  public groupFrameContains(worldX: number, worldY: number): boolean {
    return this.highlights.groupFrameContains(worldX, worldY);
  }

  /** DM selection feedback that must not reach the mirrored player frame. */
  public getPlayerViewLayers(): LayerVisibility[] {
    return [this.highlights.layer, this.marqueeGraphics, this.groupRotation.layer].map(layer => ({ layer, visible: false }));
  }

  /** Draws the selection as the canvas shows it now: called when it or a selected thing changes. */
  public updateSelectionOverlay(): void {
    if (this.highlights.layer.destroyed) return;
    const { selectedIds, objects } = this.store.getState();
    const targets = selectionTargets(selectedIds, {
      world: this.viewport,
      tokens: this.tokenRendererProvider(),
      drawings: objects.drawings,
      fog: this.fogSpriteProvider(),
      bars: this.barsProvider,
    });
    this.highlights.show(targets);
    const tokens = mapTokens(objects);
    const tokenIds = this.groupTurnHost ? targets.filter((target) => tokens[target.id]).map((target) => target.id) : [];
    this.groupRotation.follow(this.highlights.groupFrameBox(), tokenIds, this.selectionStart !== null);
  }

  /** Re-registers viewport event listeners, pushing them to the end of the listener queue.
   *  Call after adding other viewport pointerdown handlers to ensure correct firing order. */
  public reorderViewportListeners(): void {
    const activeTool = this.store.getState().activeTool;
    if (activeTool === 'select' || activeTool === 'move') {
      this.viewport.off('pointerdown', this.marqueeDownHandler);
      this.viewport.off('pointermove', this.marqueeMoveHandler);
      this.viewport.off('pointerup', this.marqueeUpHandler);
      this.viewport.off('pointerupoutside', this.marqueeUpHandler);
      this.viewport.on('pointerdown', this.marqueeDownHandler);
      this.viewport.on('pointermove', this.marqueeMoveHandler);
      this.viewport.on('pointerup', this.marqueeUpHandler);
      this.viewport.on('pointerupoutside', this.marqueeUpHandler);
    }
  }

  public destroy(): void {
    // Unsubscribe from store changes first to prevent any updates during destruction
    this._unsubscribeFromSelectionChanges?.();
    this._unsubscribeFromToolChanges?.();
    this._unsubscribeFromDrawingChanges?.();
    this._unsubscribeFromSelectionMode?.();

    // Remove event listeners from viewport
    this.viewport.off('pointerdown', this.marqueeDownHandler);
    this.viewport.off('pointermove', this.marqueeMoveHandler);
    this.viewport.off('pointerup', this.marqueeUpHandler);
    this.viewport.off('pointerupoutside', this.marqueeUpHandler);
    
    if (this.mapLoadedHandler) {
      this.eventBus.off('map-loaded', this.mapLoadedHandler);
      this.mapLoadedHandler = null;
    }

    this.groupRotation.destroy();

    // Destroy graphics objects
    if (this.marqueeGraphics && !this.marqueeGraphics.destroyed) {
      this.marqueeGraphics.destroy();
    }
    this.highlights.destroy();
  }
} 
