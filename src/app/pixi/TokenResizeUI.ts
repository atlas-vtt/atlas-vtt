import { Container, FederatedPointerEvent, Graphics, Sprite, Texture, Circle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { getTokenRingCenterRadius } from './token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth, RESIZE_HANDLE_SIZE, resizedTokenSize, TOKEN_HANDLE_LABEL, tokenUIScale } from './token-renderer/tokenSizing';
import { toError } from '../utils/errors';
import type { TokenHandleContainer } from './token-renderer/types';
import { findTokenGroup } from './token-renderer/findTokenGroup';
import { destroyTree } from './utils/destroyTree';
import { resizedTokenCenter } from '../grid/gridPlacement';
import { mapTokens } from '../tokens/offMap';

export class TokenResizeUI {
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private resizeHandles: Map<string, { left: TokenHandleContainer; right: TokenHandleContainer }> = new Map();
  
  // Handle appearance - matching status badge style
  private readonly HANDLE_SIZE = RESIZE_HANDLE_SIZE; // Same as status badges
  private readonly HANDLE_DISTANCE = 0; // Place on token edge like status badges
  
  // Resize state
  private isResizing: boolean = false;
  private isHiddenDuringRotation: boolean = false;
  private resizingTokenIds: string[] = [];
  private resizeStartX: number = 0;
  private initialSizes: Record<string, number> = {};
  private startSizes: Record<string, number> = {}; // For undo/redo
  private hasResized: boolean = false; // Track if any resize occurred
  private temporarySizes: Record<string, number> = {}; // Track temp sizes during drag
  private activeHandle: 'left' | 'right' | null = null;
  
  // Icon textures
  private iconTextures: Map<string, Texture> = new Map();
  private texturesInitialized: boolean = false;
  
  // Lucide React ChevronLeft and ChevronRight icons
  private readonly CHEVRON_LEFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>`;
  
  private readonly CHEVRON_RIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>`;
  
  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;
    
    // Initialize icon textures
    this.initializeTextures().catch(err => {
      console.error('[TokenResizeUI] Failed to initialize textures:', err);
    });
    
    // Listen for resize events to update handle positions
    window.addEventListener('atlas-tokens-resize-update', this.onResizeUpdate);
    window.addEventListener('atlas-tokens-drag-update', this.onTokenDragUpdate);
    
    // Listen for rotation events to hide/show resize handles
    window.addEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.addEventListener('atlas-token-rotation-ended', this.onRotationEnded);
  }
  
  /**
   * Get temporary size for a token during resize
   */
  public getTemporarySize(tokenId: string): number | undefined {
    return this.temporarySizes[tokenId];
  }
  
  /**
   * Check if currently resizing
   */
  public get isCurrentlyResizing(): boolean {
    return this.isResizing;
  }
  
  /**
   * Initialize icon textures
   */
  private async initializeTextures(): Promise<void> {
    if (this.texturesInitialized) return;
    
    // Use DPR-aware canvas size for crisp icons on retina displays
    const baseSvgSize = 24;
    const dpr = Math.min(window.devicePixelRatio || 1, 4); // cap at 4x
    const canvasSize = Math.round(baseSvgSize * dpr * 2); // 2x headroom beyond DPR
    const themes = ['light', 'dark'] as const;
    const icons = [
      { name: 'chevron-left', svg: this.CHEVRON_LEFT_SVG },
      { name: 'chevron-right', svg: this.CHEVRON_RIGHT_SVG }
    ];
    
    for (const theme of themes) {
      const isDark = theme === 'dark';
      const color = isDark ? '#ffffff' : '#000000';
      
      for (const icon of icons) {
        const coloredSvg = icon.svg
          .replace(/stroke="currentColor"/g, `stroke="${color}"`)
          .replace(/width="\d+"/, `width="${canvasSize}"`)
          .replace(/height="\d+"/, `height="${canvasSize}"`);
        const key = `${icon.name}-${theme}`;
        
        const canvas = createEl('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = (): void => {
              try {
                ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
                const texture = Texture.from(canvas);
                this.iconTextures.set(key, texture);
                resolve();
              } catch (err) {
                console.error(`[TokenResizeUI] Failed to create texture for ${key}:`, err);
                reject(toError(err, 'Failed to build icon texture'));
              }
            };
            img.onerror = (err): void => {
              console.error(`[TokenResizeUI] Failed to load SVG for ${key}:`, err);
              reject(toError(err, 'Failed to build icon texture'));
            };
            img.src = `data:image/svg+xml,${encodeURIComponent(coloredSvg)}`;
          });
        }
      }
    }
    
    this.texturesInitialized = true;
  }
  
  /**
   * Show resize handles for selected tokens
   */
  public showHandles(tokenIds: string[], tokenContainers?: Record<string, Container>): void {
    // Don't show handles if hidden during rotation
    if (this.isHiddenDuringRotation) {
      return;
    }
    
    // Hide all existing handles first
    this.hideAllHandles();
    
    // Create handles for each selected token
    for (const tokenId of tokenIds) {
      const token = mapTokens(this.store.getState().objects)[tokenId];
      if (!token) continue;
      
      // Get the token container if provided
      const tokenContainer = tokenContainers?.[tokenId];
      if (!tokenContainer) {
        console.warn(`[TokenResizeUI] No token container found for ${tokenId}`);
        continue;
      }
      
      // Create left and right handles and add them to the token container
      const leftHandle = this.createResizeHandle('left');
      const rightHandle = this.createResizeHandle('right');
      
      // Ensure handles are on top
      leftHandle.zIndex = 1000;
      rightHandle.zIndex = 1000;
      
      this.resizeHandles.set(tokenId, { left: leftHandle, right: rightHandle });
      tokenContainer.addChild(leftHandle);
      tokenContainer.addChild(rightHandle);
      
      // Force sort to ensure handles are on top
      tokenContainer.sortChildren();
      
      // Ensure handle stays interactive
      leftHandle.interactive = true;
      rightHandle.interactive = true;
      
      // Position will be updated in updateHandlePositions
    }
    
    // Update positions
    this.updateHandlePositions();
  }
  
  /**
   * Hide all resize handles
   */
  public hideAllHandles(): void {
    for (const [, handles] of this.resizeHandles) {
      if (handles.left.parent) {
        handles.left.parent.removeChild(handles.left);
      }
      if (handles.right.parent) {
        handles.right.parent.removeChild(handles.right);
      }
      destroyTree(handles.left);
      destroyTree(handles.right);
    }
    this.resizeHandles.clear();
  }
  
  /**
   * Update handle positions based on token positions and sizes
   */
  public updateHandlePositions(tokenSprites?: Record<string, Container>): void {
    for (const [tokenId, handles] of this.resizeHandles) {
      const token = mapTokens(this.store.getState().objects)[tokenId];
      if (!token) continue;
      
      const gridSize = this.store.getState().grid?.size || 70;

      // Get current size - check for temporary size during drag
      const tempSize = this.temporarySizes[tokenId];
      const currentSize = tempSize !== undefined ? tempSize : (token.size || 1);
      
      // Calculate token ring center radius (must match SpriteFactory.createTokenRing)
      const gridStrokeWidth = computeTokenStrokeWidth(gridSize);
      const spriteSize = computeTokenPixelSize(gridSize, currentSize);
      // Handles keep their proportions to the token, including while it is being resized
      handles.left.scale.set(tokenUIScale(spriteSize));
      handles.right.scale.set(tokenUIScale(spriteSize));
      const ringScale = this.store.getState().tokenSettings?.tokenRingSize ?? 1;
      const ringTokenSize = spriteSize * ringScale;
      const ringCenterRadius = getTokenRingCenterRadius(ringTokenSize, gridStrokeWidth, ringScale);
      
      // Handles sit on the ring's left and right, independent of the token's rotation,
      // matching the horizontal drag that resizes the token.
      handles.left.position.set(-ringCenterRadius, 0);
      handles.right.position.set(ringCenterRadius, 0);
    }
  }
  
  /**
   * Create a resize handle graphic
   */
  private createResizeHandle(direction: 'left' | 'right'): TokenHandleContainer {
    // Get theme colors - matching status badges
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bg = new Graphics();
    const handle: TokenHandleContainer = Object.assign(new Container({ label: TOKEN_HANDLE_LABEL }), { bg, isDarkMode });
    handle.eventMode = 'static';
    handle.interactive = true;
    handle.cursor = 'ew-resize';
    // Set a circular hit area for the handle - this should be precise to avoid blocking token
    handle.hitArea = new Circle(0, 0, this.HANDLE_SIZE / 2);
    
    const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
    const strokeColor = isDarkMode ? 0xffffff : 0x000000;
    const strokeAlpha = isDarkMode ? 0.4 : 0.3;
    
    // Create background circle - matching status badge style
    bg.circle(0, 0, this.HANDLE_SIZE / 2);
    bg.fill({ color: bgColor, alpha: 0.95 });
    bg.stroke({ width: 0.5, color: strokeColor, alpha: strokeAlpha });
    handle.addChild(bg);
    
    // Add icon if texture is available
    const iconKey = `chevron-${direction}-${isDarkMode ? 'dark' : 'light'}`;
    const iconTexture = this.iconTextures.get(iconKey);
    
    if (iconTexture) {
      const iconSprite = new Sprite(iconTexture);
      iconSprite.anchor.set(0.5);
      const canvasSize = iconTexture.width;
      iconSprite.scale.set(this.HANDLE_SIZE * 0.6 / canvasSize); // 60% of badge size
      iconSprite.position.set(0, 0);
      handle.addChild(iconSprite);
    }
    
    // Add hover effects - subtle like status badges
    handle.on('pointerover', () => {
      handle.cursor = 'ew-resize';
      // Just increase alpha slightly on hover
      bg.clear();
      bg.circle(0, 0, this.HANDLE_SIZE / 2);
      bg.fill({ color: bgColor, alpha: 1 });
      bg.stroke({ width: 0.5, color: strokeColor, alpha: strokeAlpha * 1.5 });
    });
    
    handle.on('pointerout', () => {
      if (!this.isResizing) {
        handle.cursor = 'ew-resize';
        bg.clear();
        bg.circle(0, 0, this.HANDLE_SIZE / 2);
        bg.fill({ color: bgColor, alpha: 0.95 });
        bg.stroke({ width: 0.5, color: strokeColor, alpha: strokeAlpha });
      }
    });
    
    // Add resize interaction
    handle.on('pointerdown', (e) => {
      e.stopPropagation();
      this.startResize(e, direction);
    });
    
    return handle;
  }
  
  /**
   * Start resizing tokens
   */
  private startResize(e: FederatedPointerEvent, direction: 'left' | 'right'): void {
    this.isResizing = true;
    this.hasResized = false;
    this.activeHandle = direction;
    
    // Get all selected token IDs
    const selectedIds = this.store.getState().selectedIds;
    this.resizingTokenIds = selectedIds;
    
    // Hide other UI elements during resize
    window.dispatchEvent(new CustomEvent('atlas-token-resize-started', {
      detail: { tokenIds: this.resizingTokenIds }
    }));
    
    // Store initial sizes and positions
    const worldPos = this.viewport.toWorld(e.global);
    this.resizeStartX = worldPos.x;
    
    for (const tokenId of this.resizingTokenIds) {
      const token = mapTokens(this.store.getState().objects)[tokenId];
      if (token) {
        // Get current size or default to 1
        const currentSize = token.size || 1;
        this.initialSizes[tokenId] = currentSize;
        this.startSizes[tokenId] = currentSize; // For undo/redo
      }
    }
    
    // Change cursor
    this.viewport.cursor = 'ew-resize';
    for (const handles of this.resizeHandles.values()) {
      handles.left.cursor = 'ew-resize';
      handles.right.cursor = 'ew-resize';
    }
    
    // Set up event listeners
    this.viewport.on('pointermove', this.onResizeMove);
    this.viewport.on('pointerup', this.onResizeEnd);
    this.viewport.on('pointerupoutside', this.onResizeEnd);
  }
  
  /**
   * Handle resize movement
   */
  private onResizeMove = (e: FederatedPointerEvent): void => {
    if (!this.isResizing) return;
    
    // Calculate resize delta
    const worldPos = this.viewport.toWorld(e.global);
    const deltaX = worldPos.x - this.resizeStartX;
    
    // Calculate size change based on drag distance
    const gridSize = this.store.getState().grid?.size || 70;
    const deltaUnits = deltaX / gridSize;
    
    // Apply direction modifier (left handle decreases size, right increases)
    const directionModifier = this.activeHandle === 'left' ? -1 : 1;
    const sizeChange = deltaUnits * directionModifier;
    
    // Each half-cell of pointer travel advances one size, including Small and Tiny.
    const steps = Math.round(sizeChange * 2);
    
    // Update all selected tokens WITHOUT creating undo states
    const updates: Array<{ id: string; size: number }> = [];
    let anyChanged = false;
    
    for (const tokenId of this.resizingTokenIds) {
      const initialSize = this.initialSizes[tokenId] || 1;
      const newSize = resizedTokenSize(initialSize, steps);
      
      const token = mapTokens(this.store.getState().objects)[tokenId];
      const lastTempSize = this.temporarySizes[tokenId];
      if (token && lastTempSize !== newSize) {
        anyChanged = true;
        updates.push({ id: tokenId, size: newSize });
      }
    }
    
    // Only update if there were actual changes
    if (anyChanged) {
      this.hasResized = true;
      
      // Store temporary sizes for visual updates
      for (const update of updates) {
        this.temporarySizes[update.id] = update.size;
      }
      
      // Trigger a re-render of tokens to show the resize
      window.dispatchEvent(new CustomEvent('atlas-tokens-resize-update', { 
        detail: { tokenIds: updates.map(u => u.id) } 
      }));
    }
    
    // Update handle positions
    this.updateHandlePositions();
    
    // Also trigger rotation handle update since token size changed
    window.dispatchEvent(new CustomEvent('atlas-token-size-changing', { 
      detail: { tokenIds: updates.map(u => u.id) } 
    }));
  };
  
  /**
   * End resize
   */
  private onResizeEnd = (e: FederatedPointerEvent): void => {
    if (!this.isResizing) return;
    
    let pendingUpdates: Array<{ id: string; changes: { size: number; x: number; y: number } }> = [];
    // If resize occurred, create a single undo state for all resizes
    if (this.hasResized) {
      const { grid, objects } = this.store.getState();
      
      for (const tokenId of this.resizingTokenIds) {
        const tempSize = this.temporarySizes[tokenId];
        const startSize = this.startSizes[tokenId] || 1;
        const token = mapTokens(objects)[tokenId];
        
        // Check if size actually changed from start
        if (token && tempSize !== undefined && tempSize !== startSize) {
          const center = resizedTokenCenter(token, startSize, tempSize, grid);
          pendingUpdates.push({ id: tokenId, changes: { size: tempSize, x: center.x, y: center.y } });
        }
      }
    }
    
    // Store the token IDs before clearing resize state
    const resizedTokenIds = [...this.resizingTokenIds];
    
    this.isResizing = false;
    this.resizingTokenIds = [];
    this.initialSizes = {};
    this.startSizes = {};
    this.hasResized = false;
    this.temporarySizes = {};
    this.activeHandle = null;
    
    // Commit after clearing temporary sizes so TokenRenderer's store subscriber
    // applies the final size instead of deferring to a temp override.
    if (pendingUpdates.length > 0) {
      this.store.getState().updateTokens(pendingUpdates);
    }

    // Show other UI elements again after resize completes
    window.dispatchEvent(new CustomEvent('atlas-token-resize-ended', {
      detail: { tokenIds: resizedTokenIds }
    }));
    
    // Reset cursor
    this.viewport.cursor = 'default';
    for (const handles of this.resizeHandles.values()) {
      handles.left.cursor = 'ew-resize';
      handles.right.cursor = 'ew-resize';
      
      // Reset handle appearance
      const resetHandle = ({ bg, isDarkMode: wasDarkMode }: TokenHandleContainer): void => {
        const isDarkMode = wasDarkMode || document.body.classList.contains('theme-dark');
        const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
        const strokeColor = isDarkMode ? 0xffffff : 0x000000;
        const strokeAlpha = isDarkMode ? 0.4 : 0.3;
        
        bg.clear();
        bg.circle(0, 0, this.HANDLE_SIZE / 2);
        bg.fill({ color: bgColor, alpha: 0.95 });
        bg.stroke({ width: 0.5, color: strokeColor, alpha: strokeAlpha });
      };
      
      resetHandle(handles.left);
      resetHandle(handles.right);
    }
    
    // Remove event listeners
    this.viewport.off('pointermove', this.onResizeMove);
    this.viewport.off('pointerup', this.onResizeEnd);
    this.viewport.off('pointerupoutside', this.onResizeEnd);
  };
  
  /**
   * Handle resize update events
   */
  private onResizeUpdate = (): void => {
    // Update handle positions when tokens resize
    this.updateHandlePositions();
  };
  
  /**
   * Handle token drag update events
   */
  private onTokenDragUpdate = (): void => {
    // Update handle positions when tokens are dragged
    this.updateHandlePositions();
  };
  
  /**
   * Handle rotation started events - hide resize handles
   */
  private onRotationStarted = (): void => {
    this.isHiddenDuringRotation = true;
    this.hideAllHandles();
  };
  
  /**
   * Handle rotation ended events - show resize handles if tokens are selected
   */
  private onRotationEnded = (): void => {
    this.isHiddenDuringRotation = false;
    // Note: TokenRenderer will handle re-showing handles with proper token containers
  };
  
  /**
   * Update handle theme when theme changes
   */
  public updateTheme(): void {
    // Re-create all handles with new theme — must pass token containers
    const tokenIds = Array.from(this.resizeHandles.keys());
    if (tokenIds.length > 0) {
      const containers: Record<string, Container> = {};
      for (const id of tokenIds) {
        const c = findTokenGroup(this.viewport, id);
        if (c) containers[id] = c;
      }
      this.showHandles(tokenIds, containers);
    }
  }
  
  public getHandles(): Container[] {
    return [...this.resizeHandles.values()].flatMap(({ left, right }) => [left, right]);
  }

  /**
   * Clean up and destroy
   */
  public destroy(): void {
    this.hideAllHandles();
    
    // Remove event listeners
    window.removeEventListener('atlas-tokens-resize-update', this.onResizeUpdate);
    window.removeEventListener('atlas-tokens-drag-update', this.onTokenDragUpdate);
    window.removeEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.removeEventListener('atlas-token-rotation-ended', this.onRotationEnded);
    
    // Destroy textures
    for (const texture of this.iconTextures.values()) {
      if (texture && !texture.destroyed) {
        texture.destroy(true);
      }
    }
    this.iconTextures.clear();
    
    // No container to destroy anymore since handles are children of token containers
  }

  /**
   * Compatibility method for UIManager - shows handles for a single token
   */
  public show(tokenId: string, tokenSize: number): void {
    // Find the token container in the viewport
    const tokenContainer = findTokenGroup(this.viewport, tokenId);
    if (tokenContainer) {
      this.showHandles([tokenId], { [tokenId]: tokenContainer });
    } else {
      console.warn(`[TokenResizeUI] Could not find token container for ${tokenId}`);
    }
  }
  
  /**
   * Compatibility method for UIManager - hides all handles
   */
  public hide(): void {
    this.hideAllHandles();
  }
}
