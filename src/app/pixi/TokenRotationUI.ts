import { Container, FederatedPointerEvent, Graphics, Sprite, Texture, Circle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { getTokenRingCenterRadius } from './token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth, TOKEN_HANDLE_LABEL, tokenUIScale } from './token-renderer/tokenSizing';
import { paintRotateHandle, rotateIconTexture, ROTATE_ICON_SHARE } from './rotateHandleLook';
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import type { TokenHandleContainer } from './token-renderer/types';
import { findTokenGroup } from './token-renderer/findTokenGroup';
import type { TokenResizeUI } from './TokenResizeUI';
import { destroyTree } from './utils/destroyTree';
import { levelObjects } from '../levels/levelObjects';
import { mapTokens } from '../tokens/offMap';

export class TokenRotationUI {
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private rotationHandles: Map<string, TokenHandleContainer> = new Map();
  private tokenResizeUI: TokenResizeUI | undefined; // Reference to resize UI for getting temporary sizes
  
  // Handle appearance - matching status badge style
  private readonly HANDLE_SIZE = 20; // Same as status badges
  private readonly HANDLE_DISTANCE = 0; // Place on token edge like status badges
  
  // Rotation state
  private isRotating: boolean = false;
  private hiddenDuringResize: Set<string> = new Set(); // Track which tokens are hidden during resize
  private isHiddenDuringRotation: boolean = false;
  private rotatingTokenIds: string[] = [];
  private rotationStartAngle: number = 0;
  private initialRotations: Record<string, number> = {};
  private startRotations: Record<string, number> = {}; // For undo/redo
  private hasRotated: boolean = false; // Track if any rotation occurred
  private temporaryRotations: Record<string, number> = {}; // Track temp rotations during drag
  
  // Icon textures
  private iconTextures: Map<string, Texture> = new Map();
  private texturesInitialized: boolean = false;
  
  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;
    
    // Initialize icon textures
    this.initializeTextures().catch(err => {
      console.error('[TokenRotationUI] Failed to initialize textures:', err);
    });
    
    // Listen for rotation events to update handle positions
    window.addEventListener('atlas-tokens-rotation-update', this.onRotationUpdate);
    window.addEventListener('atlas-tokens-drag-update', this.onTokenDragUpdate);
    window.addEventListener('atlas-token-size-changing', this.onTokenSizeChanging);
    
    // Listen for resize events to hide/show handles
    window.addEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.addEventListener('atlas-token-resize-ended', this.onResizeEnded);
  }
  
  /**
   * Get temporary rotation for a token during rotation
   */
  public getTemporaryRotation(tokenId: string): number | undefined {
    return this.temporaryRotations[tokenId];
  }
  
  /**
   * Set reference to resize UI for getting temporary sizes
   */
  public setResizeUI(resizeUI: TokenResizeUI): void {
    this.tokenResizeUI = resizeUI;
  }
  
  /**
   * Check if currently rotating
   */
  public get isCurrentlyRotating(): boolean {
    return this.isRotating;
  }
  
  /**
   * Initialize icon textures
   */
  private async initializeTextures(): Promise<void> {
    if (this.texturesInitialized) return;
    for (const theme of ['light', 'dark'] as const) {
      this.iconTextures.set(`rotate-${theme}`, await rotateIconTexture(theme === 'dark'));
    }
    this.texturesInitialized = true;
  }
  
  /**
   * Show rotation handles for selected tokens
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
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      if (!token) continue;
      
      // Get the token container if provided
      const tokenContainer = tokenContainers?.[tokenId];
      if (!tokenContainer) {
        console.warn(`[TokenRotationUI] No token container found for ${tokenId}`);
        continue;
      }
      
      // Skip if this token is hidden during resize
      if (this.hiddenDuringResize.has(tokenId)) {
        continue;
      }
      
      // Create handle and add it to the token container
      const handle = this.createRotationHandle();
      handle.zIndex = 1000; // Ensure handles are on top
      this.rotationHandles.set(tokenId, handle);
      tokenContainer.addChild(handle);
      
      // Force sort to ensure handle is on top
      tokenContainer.sortChildren();
      
      // Position will be updated in updateHandlePositions
    }
    
    // Update positions
    this.updateHandlePositions();
  }
  
  /**
   * Hide all rotation handles
   */
  public hideAllHandles(): void {
    for (const [, handle] of this.rotationHandles) {
      if (handle.parent) {
        handle.parent.removeChild(handle);
      }
      destroyTree(handle);
    }
    this.rotationHandles.clear();
  }
  
  /**
   * Update handle positions based on token positions and sizes
   */
  public updateHandlePositions(tokenSprites?: Record<string, Container>, temporarySizes?: Record<string, number>): void {
    for (const [tokenId, handle] of this.rotationHandles) {
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      if (!token) continue;
      
      const gridSize = this.store.getState().grid?.size || 70;

      // Get token size - check for temporary size during resize
      const tempSize = temporarySizes?.[tokenId];
      const tokenSize = tempSize !== undefined ? tempSize : (token.size || 1);
      
      // Calculate token ring center radius (must match SpriteFactory.createTokenRing)
      const gridStrokeWidth = computeTokenStrokeWidth(gridSize);
      const spriteSize = computeTokenPixelSize(gridSize, tokenSize);
      // The handle keeps its proportions to the token, including while it is being resized
      handle.scale.set(tokenUIScale(spriteSize));
      const ringScale = this.store.getState().tokenSettings?.tokenRingSize ?? 1;
      const ringTokenSize = spriteSize * ringScale;
      const ringCenterRadius = getTokenRingCenterRadius(ringTokenSize, gridStrokeWidth, ringScale);
      
      // The handle rests at the top of the ring whatever the token's rotation, so it never lands
      // on the resource bars or the resize handles; during a drag it follows the pointer's turn.
      const tempRotation = this.temporaryRotations[tokenId];
      const dragDelta = tempRotation === undefined ? 0 : tempRotation - (this.initialRotations[tokenId] ?? 0);
      const angleRad = (dragDelta - 90) * Math.PI / 180;
      const distance = ringCenterRadius;
      
      // Since handle is a child of token container, use relative position (0,0 is token center)
      const handleX = Math.cos(angleRad) * distance;
      const handleY = Math.sin(angleRad) * distance;
      
      handle.position.set(handleX, handleY);
    }
  }
  
  /**
   * Create a rotation handle graphic
   */
  private createRotationHandle(): TokenHandleContainer {
    // Get theme colors - matching status badges
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bg = new Graphics();
    const handle: TokenHandleContainer = Object.assign(new Container({ label: TOKEN_HANDLE_LABEL }), { bg, isDarkMode });
    handle.eventMode = 'static';
    handle.interactive = true;
    handle.cursor = 'grab';
    const radius = this.HANDLE_SIZE / 2;
    // Set a circular hit area for the handle - this should be precise to avoid blocking token
    handle.hitArea = new Circle(0, 0, radius);

    paintRotateHandle(bg, radius, false);
    handle.addChild(bg);
    
    // Add icon if texture is available
    const iconKey = `rotate-${isDarkMode ? 'dark' : 'light'}`;
    const iconTexture = this.iconTextures.get(iconKey);
    
    if (iconTexture) {
      const iconSprite = new Sprite(iconTexture);
      iconSprite.anchor.set(0.5);
      const canvasSize = iconTexture.width;
      iconSprite.scale.set(this.HANDLE_SIZE * ROTATE_ICON_SHARE / canvasSize);
      iconSprite.position.set(0, 0);
      handle.addChild(iconSprite);
    }
    
    handle.on('pointerover', () => paintRotateHandle(bg, radius, true));
    handle.on('pointerout', () => {
      if (!this.isRotating) paintRotateHandle(bg, radius, false);
    });
    
    // Add rotation interaction
    handle.on('pointerdown', (e) => {
      e.stopPropagation();
      this.startRotation(e);
    });
    
    return handle;
  }
  
  /**
   * Start rotating tokens
   */
  private startRotation(e: FederatedPointerEvent): void {
    this.isRotating = true;
    this.hasRotated = false;
    
    // Get all selected token IDs
    const selectedIds = this.store.getState().selectedIds;
    this.rotatingTokenIds = selectedIds;
    
    // Calculate center of rotation (center of all selected tokens)
    let centerX = 0;
    let centerY = 0;
    let count = 0;
    
    for (const tokenId of this.rotatingTokenIds) {
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      if (token) {
        centerX += token.x;
        centerY += token.y;
        count++;
        // Store initial rotation for both live updates and undo
        const currentRotation = token.rotation || 0;
        this.initialRotations[tokenId] = currentRotation;
        this.startRotations[tokenId] = currentRotation; // For undo/redo
      }
    }
    
    if (count > 0) {
      centerX /= count;
      centerY /= count;
    }
    
    // Calculate starting angle from center to cursor
    const worldPos = this.viewport.toWorld(e.global);
    this.rotationStartAngle = Math.atan2(worldPos.y - centerY, worldPos.x - centerX);
    
    // Hide other UI elements during rotation
    window.dispatchEvent(new CustomEvent('atlas-token-rotation-started', {
      detail: { tokenIds: this.rotatingTokenIds }
    }));
    
    // Change cursor
    this.viewport.cursor = 'grabbing';
    for (const handle of this.rotationHandles.values()) {
      handle.cursor = 'grabbing';
    }
    
    // Set up event listeners
    this.viewport.on('pointermove', this.onRotationMove);
    this.viewport.on('pointerup', this.onRotationEnd);
    this.viewport.on('pointerupoutside', this.onRotationEnd);
  }
  
  /**
   * Handle rotation movement
   */
  private onRotationMove = (e: FederatedPointerEvent): void => {
    if (!this.isRotating) return;
    
    // Calculate center of rotation
    let centerX = 0;
    let centerY = 0;
    let count = 0;
    
    for (const tokenId of this.rotatingTokenIds) {
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      if (token) {
        centerX += token.x;
        centerY += token.y;
        count++;
      }
    }
    
    if (count > 0) {
      centerX /= count;
      centerY /= count;
    }
    
    // Calculate current angle
    const worldPos = this.viewport.toWorld(e.global);
    const currentAngle = Math.atan2(worldPos.y - centerY, worldPos.x - centerX);
    
    // Calculate rotation delta
    let deltaAngle = (currentAngle - this.rotationStartAngle) * 180 / Math.PI;
    
    // Always snap to increments
    const snapIncrement = e.shiftKey ? 45 : 15; // 45 degrees with shift, 15 degrees normally
    deltaAngle = Math.round(deltaAngle / snapIncrement) * snapIncrement;
    
    // Update all selected tokens WITHOUT creating undo states
    const updates: Array<{ id: string; rotation: number }> = [];
    let anyChanged = false;
    
    for (const tokenId of this.rotatingTokenIds) {
      const initialRotation = this.initialRotations[tokenId] || 0;
      let newRotation = (initialRotation + deltaAngle) % 360;
      if (newRotation < 0) newRotation += 360;
      
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      if (token && token.rotation !== newRotation) {
        anyChanged = true;
        updates.push({ id: tokenId, rotation: newRotation });
      }
    }
    
    // Only update if there were actual changes
    if (anyChanged) {
      this.hasRotated = true;
      
      // Store temporary rotations for visual updates
      for (const update of updates) {
        this.temporaryRotations[update.id] = update.rotation;
      }
      
      // Trigger a re-render of tokens to show the rotation
      // We'll emit an event that the TokenRenderer can listen to
      window.dispatchEvent(new CustomEvent('atlas-tokens-rotation-update', { 
        detail: { tokenIds: updates.map(u => u.id) } 
      }));
    }
    
    // Update handle positions with temporary sizes if available
    if (this.tokenResizeUI) {
      const tempSizes: Record<string, number> = {};
      for (const tokenId of this.rotatingTokenIds) {
        const tempSize = this.tokenResizeUI.getTemporarySize(tokenId);
        if (tempSize !== undefined) {
          tempSizes[tokenId] = tempSize;
        }
      }
      this.updateHandlePositions(undefined, tempSizes);
    } else {
      this.updateHandlePositions();
    }
  };
  
  /**
   * End rotation
   */
  private onRotationEnd = (e: FederatedPointerEvent): void => {
    if (!this.isRotating) return;
    
    // If rotation occurred, create a single undo state for all rotations
    if (this.hasRotated) {
      const finalRotations: Array<{ id: string; rotation: number }> = [];
      
      for (const tokenId of this.rotatingTokenIds) {
        const tempRotation = this.temporaryRotations[tokenId];
        const startRotation = this.startRotations[tokenId] || 0;
        
        // Check if rotation actually changed from start
        if (tempRotation !== undefined && tempRotation !== startRotation) {
          finalRotations.push({ 
            id: tokenId, 
            rotation: tempRotation 
          });
        }
      }
      
      if (finalRotations.length > 0) {
        this.store.getState().updateTokens(
          finalRotations.map(({ id, rotation }) => ({ id, changes: { rotation } }))
        );
      }
    }
    
    // Store the token IDs before clearing rotation state
    const rotatedTokenIds = [...this.rotatingTokenIds];
    
    this.isRotating = false;
    this.rotatingTokenIds = [];
    this.initialRotations = {};
    this.startRotations = {};
    this.hasRotated = false;
    this.temporaryRotations = {};
    // Return the handle to its resting place at the top of the ring
    this.updateHandlePositions();

    // Show other UI elements again after rotation completes
    window.dispatchEvent(new CustomEvent('atlas-token-rotation-ended', {
      detail: { tokenIds: rotatedTokenIds }
    }));
    
    // Reset cursor
    this.viewport.cursor = 'default';
    for (const handle of this.rotationHandles.values()) {
      handle.cursor = 'grab';
      paintRotateHandle(handle.bg, this.HANDLE_SIZE / 2, false);
    }
    
    // Remove event listeners
    this.viewport.off('pointermove', this.onRotationMove);
    this.viewport.off('pointerup', this.onRotationEnd);
    this.viewport.off('pointerupoutside', this.onRotationEnd);
  };
  
  /**
   * Handle rotation update events
   */
  private onRotationUpdate = (): void => {
    // Update handle positions when tokens rotate
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
   * Handle token size changing events
   */
  private onTokenSizeChanging = (e: CustomEvent<TokenGestureEventDetail>): void => {
    // Update handle positions when tokens are being resized
    if (this.tokenResizeUI) {
      const tokenIds = e.detail.tokenIds;
      const tempSizes: Record<string, number> = {};
      for (const tokenId of tokenIds) {
        const tempSize = this.tokenResizeUI.getTemporarySize(tokenId);
        if (tempSize !== undefined) {
          tempSizes[tokenId] = tempSize;
        }
      }
      this.updateHandlePositions(undefined, tempSizes);
    }
  };
  
  /**
   * Handle resize started events - hide rotation handles for specific tokens
   */
  private onResizeStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizingTokenIds = e.detail.tokenIds;
    
    // Hide handles only for tokens being resized
    for (const tokenId of resizingTokenIds) {
      this.hiddenDuringResize.add(tokenId);
      const handle = this.rotationHandles.get(tokenId);
      if (handle && handle.parent) {
        handle.parent.removeChild(handle);
      }
    }
  };
  
  /**
   * Handle resize ended events - allow rotation handles to show again
   */
  private onResizeEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizedTokenIds = e.detail.tokenIds;
    
    // Remove tokens from hidden set - they can now show rotation handles again
    for (const tokenId of resizedTokenIds) {
      this.hiddenDuringResize.delete(tokenId);
    }
    
    // TokenRenderer will handle re-showing handles through its rotation ended event listener
  };
  
  /**
   * Update handle theme when theme changes
   */
  public updateTheme(): void {
    // Re-create all handles with new theme — must pass token containers
    const tokenIds = Array.from(this.rotationHandles.keys());
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
    return [...this.rotationHandles.values()];
  }

  /**
   * Clean up and destroy
   */
  public destroy(): void {
    this.hideAllHandles();
    
    // Clear state
    this.hiddenDuringResize.clear();
    
    // Remove event listeners
    window.removeEventListener('atlas-tokens-rotation-update', this.onRotationUpdate);
    window.removeEventListener('atlas-tokens-drag-update', this.onTokenDragUpdate);
    window.removeEventListener('atlas-token-size-changing', this.onTokenSizeChanging);
    window.removeEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.removeEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
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
      console.warn(`[TokenRotationUI] Could not find token container for ${tokenId}`);
    }
  }
  
  /**
   * Compatibility method for UIManager - hides all handles
   */
  public hide(): void {
    this.hideAllHandles();
  }
}
