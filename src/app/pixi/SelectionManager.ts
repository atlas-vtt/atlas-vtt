import { Graphics, Rectangle, Container, FederatedPointerEvent } from "pixi.js";
import { Viewport } from "pixi-viewport";
// For Token Sprite type if needed
import { getObsidianAccentColor, cssColorToHexNumber } from "./utils/colorUtils";
import { isHandled } from "./utils/handledEvents";
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { EventEmitter } from 'events';
import { getDrawingBounds, type DrawingBounds } from './drawingGeometry';
import type { LayerVisibility } from './playerSafeFrame';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { pointInPolygon } from '../vision/visibility';

export class SelectionManager {
  private viewport: Viewport;
  private tokenRendererProvider: () => ({ [id: string]: Container });
  /** How far a selected token's bars reach below it, in world units; the frame encloses them. */
  public barsReachProvider: (tokenId: string) => number = () => 0;
  private fogSpriteProvider: () => ({ [id: string]: Container });
  private hitTestTokensProvider?: (worldX: number, worldY: number) => string | null;

  private selectionOverlay: Graphics;
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

    this.selectionOverlay = new Graphics();
    this.selectionOverlay.eventMode = 'none'; // Make overlay non-interactive
    this.selectionOverlay.interactiveChildren = false;
    this.selectionOverlay.zIndex = MAP_LAYER_Z.selection;
    // Add overlay beneath marquee, or simply to viewport if marquee isn't always first
    const marqueeIndex = this.viewport.getChildIndex(this.marqueeGraphics);
    if (marqueeIndex !== -1) {
        this.viewport.addChildAt(this.selectionOverlay, marqueeIndex);
    } else {
        this.viewport.addChild(this.selectionOverlay); // Fallback
    }

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
      this.marqueeGraphics.stroke({ width: 2, color: accentHex, alpha: 0.6 });
      this.marqueeGraphics.fill({ color: accentHex, alpha: 0.15 });
    } else {
      // Box selection mode
      const sx = Math.min(this.selectionStart.x, worldPos.x);
      const sy = Math.min(this.selectionStart.y, worldPos.y);
      const sw = Math.abs(worldPos.x - this.selectionStart.x);
      const sh = Math.abs(worldPos.y - this.selectionStart.y);
      
      this.marqueeGraphics.roundRect(sx, sy, sw, sh, 8);
      this.marqueeGraphics.stroke({ width: 2, color: accentHex, alpha: 0.6 });
      this.marqueeGraphics.fill({ color: accentHex, alpha: 0.15 });
    }
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
    
    this.store.getState().setSelection(selectedIds);
    if (this.marqueeGraphics && !this.marqueeGraphics.destroyed) {
      this.marqueeGraphics.clear();
    }
    this.selectionStart = null;
    this.lassoPoints = [];
    // updateSelectionOverlay will be called by the store subscription
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

  /** DM selection feedback that must not reach the mirrored player frame. */
  public getPlayerViewLayers(): LayerVisibility[] {
    return [this.selectionOverlay, this.marqueeGraphics].map(layer => ({ layer, visible: false }));
  }

  public updateSelectionOverlay(): void {
    // Safety check - ensure graphics objects exist and haven't been destroyed
    if (!this.selectionOverlay || this.selectionOverlay.destroyed) {
      console.warn('[SelectionManager] Selection overlay graphics not available or has been destroyed');
      return;
    }
    
    this.selectionOverlay.clear();
    const selectedIds = this.store.getState().selectedIds;
    if (selectedIds.length === 0) return;

    const tokenSprites = this.tokenRendererProvider();
    const fogSprites = this.fogSpriteProvider();
    const drawings = this.store.getState().objects.drawings;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let foundSelectedSprite = false;

    for (const id of selectedIds) {
      const tokenGroup = tokenSprites[id];
      if (tokenGroup?.visible) {
        // Get the actual sprite from the tokenGroup (should be the first child)
        const sprite = tokenGroup.children[0];
        if (sprite && sprite.width && sprite.height) {
          // Since sprites have anchor.set(0.5) and are positioned at 0,0 within the group,
          // we use the tokenGroup's position and the sprite's dimensions
          const halfWidth = sprite.width / 2;
          const halfHeight = sprite.height / 2;
          const spriteLeft = tokenGroup.position.x - halfWidth;
          const spriteTop = tokenGroup.position.y - halfHeight;
          const spriteRight = tokenGroup.position.x + halfWidth;
          // The selection reaches around the bars below the token; its wheels stand outside
          const spriteBottom = tokenGroup.position.y + halfHeight + this.barsReachProvider(id);
          
          minX = Math.min(minX, spriteLeft);
          minY = Math.min(minY, spriteTop);
          maxX = Math.max(maxX, spriteRight);
          maxY = Math.max(maxY, spriteBottom);
          foundSelectedSprite = true;
        }
      }

      const drawing = drawings[id];
      const drawingBounds = drawing && getDrawingBounds(drawing);
      if (drawingBounds) {
        minX = Math.min(minX, drawingBounds.x);
        minY = Math.min(minY, drawingBounds.y);
        maxX = Math.max(maxX, drawingBounds.x + drawingBounds.width);
        maxY = Math.max(maxY, drawingBounds.y + drawingBounds.height);
        foundSelectedSprite = true;
      }

      // Check fog sprites
      const fogSprite = fogSprites[id];
      if (fogSprite && !fogSprite.destroyed) {
        const bounds = fogSprite.getBounds();
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
        foundSelectedSprite = true;
      }
    }

    if (!foundSelectedSprite) {
      return;
    }

    const pad = 12; // Increased padding for a more spacious look
    const finalMinX = minX - pad;
    const finalMinY = minY - pad;
    const finalMaxX = maxX + pad;
    const finalMaxY = maxY + pad;
    

    const width = finalMaxX - finalMinX;
    const height = finalMaxY - finalMinY;
    const radius = 16; // Larger radius for smoother corners

    const accent = getObsidianAccentColor();
    const accentHex = cssColorToHexNumber(accent);

    // Draw outer glow/shadow
    this.selectionOverlay.roundRect(finalMinX - 2, finalMinY - 2, width + 4, height + 4, radius);
    this.selectionOverlay.fill({ color: 0x000000, alpha: 0.1 });

    // Draw main selection box with gradient-like effect
    this.selectionOverlay.roundRect(finalMinX, finalMinY, width, height, radius);
    this.selectionOverlay.fill({ color: accentHex, alpha: 0.08 });
    
    // Draw inner stroke
    this.selectionOverlay.roundRect(finalMinX + 1, finalMinY + 1, width - 2, height - 2, radius - 1);
    this.selectionOverlay.stroke({ width: 1.5, color: accentHex, alpha: 0.8 });

    // Draw outer stroke
    this.selectionOverlay.roundRect(finalMinX, finalMinY, width, height, radius);
    this.selectionOverlay.stroke({ width: 2.5, color: accentHex, alpha: 0.4 });

    
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

    // Destroy graphics objects
    if (this.marqueeGraphics && !this.marqueeGraphics.destroyed) {
      this.marqueeGraphics.destroy();
    }
    if (this.selectionOverlay && !this.selectionOverlay.destroyed) {
      this.selectionOverlay.destroy();
    }
  }
} 
