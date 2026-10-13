/**
 * Token Sync Service
 * 
 * Manages synchronization between store state and visual representation.
 * Handles store subscriptions, animation state tracking, and token updates.
 */

import type { Application, Ticker } from 'pixi.js';
import type { ITokenSyncService, TokenGroupContainer } from './types';
import type { TokenEntity } from '../../types';
import type { SceneSource } from '../../host/sceneSource';
import type { TokenSyncState } from './tokenSyncState';
import { EventEmitter } from 'events';


export class SyncService implements ITokenSyncService {
  private source: SceneSource<TokenSyncState>;
  private moveToken: (tokenId: string, x: number, y: number) => void;
  private eventBus: EventEmitter;
  private pixiApp: Application | null = null;
  
  // Sync state
  private animatingTokens: Set<string> = new Set();
  private pendingTokenSync: { newTokens: Record<string, TokenEntity>; prevTokens: Record<string, TokenEntity> } | null = null;
  private unsubscribeFromSource?: () => void;
  
  // Callbacks for external systems
  private onTokensChanged?: (tokens: Record<string, TokenEntity>, prevTokens: Record<string, TokenEntity>) => void;
  private onTokenPositionUpdate?: (tokenId: string, x: number, y: number) => void;
  private onTokenAnimationStart?: (tokenId: string) => void;
  private onTokenAnimationEnd?: (tokenId: string) => void;
  private getTokenSprite?: (tokenId: string) => TokenGroupContainer | null;
  private updateUIPosition?: (tokenId: string, x: number, y: number) => void;
  private updateControlsPosition?: (x: number, y: number, tokenSize: number) => void;
  private animateTokenToPositionHandler: ((data: { tokenId: string; targetX: number; targetY: number; transient?: boolean }) => void) | null = null;
  private animateTokenPathHandler: ((data: { tokenId: string; finalX: number; finalY: number; path?: Array<{ x: number; y: number; timestamp: number }>; duration: number }) => void) | null = null;

  constructor(
    source: SceneSource<TokenSyncState>,
    moveToken: (tokenId: string, x: number, y: number) => void,
    eventBus: EventEmitter
  ) {
    this.source = source;
    this.moveToken = moveToken;
    this.eventBus = eventBus;
  }

  initialize(): void {
    this.unsubscribeFromSource = this.source.subscribe((state, prevState) => {
      const newTokens = state.tokens;
      const prevTokens = prevState.tokens;
      
      if (newTokens !== prevTokens) {
        const isMapLoading = state.isMapLoading;

        if (isMapLoading) {
          this.pendingTokenSync = { newTokens, prevTokens };
        } else {
          this.onTokensChanged?.(newTokens, prevTokens);
        }
      } else if (prevState.isMapLoading && !state.isMapLoading && this.pendingTokenSync) {
        // A load that ends without `map-loaded` (a scene that could not be opened) forces nothing:
        // the tokens of the scene before would stay on the canvas
        this.forceSyncTokens();
      }
    });
    
    // Fire immediately with current tokens (replaces subscribeWithSelector's fireImmediately option)
    const currentTokens = this.source.get().tokens;
    if (Object.keys(currentTokens).length > 0) {
      this.onTokensChanged?.(currentTokens, {});
    }
    
    // Set up animation event listeners
    if (this.animateTokenToPositionHandler) {
      this.eventBus.off('animate-token-to-position', this.animateTokenToPositionHandler);
    }
    if (this.animateTokenPathHandler) {
      this.eventBus.off('animate-token-path', this.animateTokenPathHandler);
    }

    this.animateTokenToPositionHandler = (data: { 
      tokenId: string, 
      targetX: number, 
      targetY: number,
      transient?: boolean
    }) => {
      this.animateTokenToPosition(data.tokenId, data.targetX, data.targetY, {
        transient: data.transient === true
      });
    };
    this.eventBus.on('animate-token-to-position', this.animateTokenToPositionHandler);

    this.animateTokenPathHandler = (data: { 
      tokenId: string, 
      finalX: number, 
      finalY: number, 
      path?: Array<{x: number, y: number, timestamp: number}>,
      duration: number 
    }) => {
      if (data.path && data.path.length > 0) {
        this.playTokenPath(data.tokenId, data.finalX, data.finalY, data.path, data.duration);
      } else {
        this.animateTokenToPosition(data.tokenId, data.finalX, data.finalY);
      }
    };
    this.eventBus.on('animate-token-path', this.animateTokenPathHandler);
  }

  forceSyncTokens(): void {
    if (this.pendingTokenSync) {
      this.onTokensChanged?.(this.pendingTokenSync.newTokens, this.pendingTokenSync.prevTokens);
      this.pendingTokenSync = null;
    } else {
      const tokens = this.source.get().tokens;
      this.onTokensChanged?.(tokens, {});
    }
  }

  isTokenAnimating(tokenId: string): boolean {
    return this.animatingTokens.has(tokenId);
  }

  animateTokenToPosition(
    tokenId: string,
    targetX: number,
    targetY: number,
    options?: { transient?: boolean }
  ): void {
    const transient = options?.transient === true;
    const tokenSprite = this.getTokenSprite?.(tokenId);
    if (!tokenSprite) {
      console.warn(`[SyncService] Cannot animate token ${tokenId}: sprite not found`);
      return;
    }

    // Get current token state from store to check if animation is still needed
    const currentToken = this.source.get().tokens[tokenId];
    if (currentToken) {
      // If the store already has the target position, skip animation and snap directly
      if (!transient && Math.abs(currentToken.x - targetX) < 0.1 && Math.abs(currentToken.y - targetY) < 0.1) {
        tokenSprite.position.set(currentToken.x, currentToken.y);
        this.updateUIPosition?.(tokenId, currentToken.x, currentToken.y);
        return;
      }
    }

    // Clear any existing animation
    this.cancelAnimation(tokenId);
    
    // Mark token as animating to prevent store position interference
    this.animatingTokens.add(tokenId);
    this.onTokenAnimationStart?.(tokenId);

    const startX = tokenSprite.position.x;
    const startY = tokenSprite.position.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    
    // Skip animation if already at target position
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) {
      this.animatingTokens.delete(tokenId);
      this.onTokenAnimationEnd?.(tokenId);
      return;
    }

    // Calculate animation duration based on distance traveled
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const pixelsPerSecond = 400; // Consistent speed regardless of distance
    const minDuration = transient ? 24 : 150; // Keep live drag preview responsive.
    const maxDuration = transient ? 80 : 600;
    const calculatedDuration = (distance / pixelsPerSecond) * 1000;
    const animationDuration = Math.max(minDuration, Math.min(maxDuration, calculatedDuration));
    

    let elapsed = 0;
    const startTime = performance.now();

    const animationTick = (ticker: Ticker): void => {
      if (!this.pixiApp) return;
      
      // Cap deltaMS to prevent large jumps during frame drops
      const cappedDeltaMS = Math.min(ticker.deltaMS, 32);
      elapsed += cappedDeltaMS;
      
      // Only check for store conflicts after animation has had time to establish
      if (!transient && elapsed > 16) {
        const currentStoreToken = this.source.get().tokens[tokenId];
        if (currentStoreToken) {
          const storeDistance = Math.abs(currentStoreToken.x - targetX) + Math.abs(currentStoreToken.y - targetY);
          if (storeDistance > 0.1) {
            // Store position has changed, cancel animation
            this.pixiApp.ticker.remove(animationTick);
            tokenSprite.currentAnimation = null;
            this.animatingTokens.delete(tokenId);
            this.onTokenAnimationEnd?.(tokenId);
            tokenSprite.position.set(currentStoreToken.x, currentStoreToken.y);
            this.updateUIPosition?.(tokenId, currentStoreToken.x, currentStoreToken.y);
            return;
          }
        }
      }
      
      // Use high-precision timing for smoother progress calculation
      const currentTime = performance.now();
      const preciseElapsed = currentTime - startTime;
      const progress = Math.min(preciseElapsed / animationDuration, 1);
      
      // Use easeInOutQuad for natural acceleration/deceleration
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress
        : 1 - 2 * (1 - progress) * (1 - progress);
      
      const currentX = startX + (deltaX * easeProgress);
      const currentY = startY + (deltaY * easeProgress);
      
      tokenSprite.position.set(currentX, currentY);
      this.updateUIPosition?.(tokenId, currentX, currentY);
      
      // Update controls position if this is the selected token
      const selectedIds = this.source.get().selectedIds;
      if (selectedIds.length === 1 && selectedIds[0] === tokenId) {
        const tokenSize = tokenSprite.children[0]?.width || 70;
        this.updateControlsPosition?.(currentX, currentY, tokenSize);
      }
      
      // Animation complete
      if (progress >= 1) {
        this.pixiApp?.ticker.remove(animationTick);
        tokenSprite.currentAnimation = null;
        
        // Ensure final position is exactly the target
        tokenSprite.position.set(targetX, targetY);
        this.updateUIPosition?.(tokenId, targetX, targetY);
        
        if (!transient) {
          // Update store with final position.
          this.moveToken(tokenId, targetX, targetY);
        }
        
        // Remove from animating set
        this.animatingTokens.delete(tokenId);
        this.onTokenAnimationEnd?.(tokenId);
      }
    };

    // Store animation reference for cleanup
    tokenSprite.currentAnimation = animationTick;
    
    // Add to ticker
    if (this.pixiApp) {
      this.pixiApp.ticker.add(animationTick);
    }
  }

  playTokenPath(
    tokenId: string, 
    finalX: number, 
    finalY: number, 
    path: Array<{x: number, y: number, timestamp: number}>, 
    originalDuration: number
  ): void {
    const tokenSprite = this.getTokenSprite?.(tokenId);
    if (!tokenSprite) {
      return;
    }

    // Check if path is valid
    if (typeof path === 'string' || !path || path.length === 0) {
      this.animateTokenToPosition(tokenId, finalX, finalY);
      return;
    }

    // Check if token is already animating
    if (this.animatingTokens.has(tokenId)) {
      return;
    }
    
    // Clear any existing animation
    this.cancelAnimation(tokenId);
    
    // Mark token as animating
    this.animatingTokens.add(tokenId);
    this.onTokenAnimationStart?.(tokenId);

    const startPos = { x: tokenSprite.position.x, y: tokenSprite.position.y };
    
    // Use slightly faster playback (80% of original duration) for responsiveness
    const playbackDuration = Math.max(originalDuration * 0.8, 200);
    
    // Normalize path timestamps to start from 0
    const normalizedPath = path.map(point => ({
      x: point.x,
      y: point.y,
      timestamp: point.timestamp - (path[0]?.timestamp || 0)
    }));
    
    // Add the start and end positions to the path
    const fullPath = [
      { x: startPos.x, y: startPos.y, timestamp: 0 },
      ...normalizedPath,
      { x: finalX, y: finalY, timestamp: originalDuration }
    ];

    let elapsed = 0;

    const pathPlaybackTick = (ticker: Ticker): void => {
      if (!this.pixiApp || !this.animatingTokens.has(tokenId)) {
        this.pixiApp?.ticker.remove(pathPlaybackTick);
        tokenSprite.currentAnimation = null;
        return;
      }
      
      elapsed += ticker.deltaMS;
      const progress = Math.min(elapsed / playbackDuration, 1);
      
      // Calculate position along the path
      const currentTime = progress * originalDuration;
      const position = this.interpolatePathPosition(fullPath, currentTime);
      
      tokenSprite.position.set(position.x, position.y);
      this.updateUIPosition?.(tokenId, position.x, position.y);
      
      // Update controls position if this is the selected token
      const selectedIds = this.source.get().selectedIds;
      if (selectedIds.length === 1 && selectedIds[0] === tokenId) {
        const tokenSize = tokenSprite.children[0]?.width || 70;
        this.updateControlsPosition?.(position.x, position.y, tokenSize);
      }
      
      // Animation complete
      if (progress >= 1) {
        this.pixiApp?.ticker.remove(pathPlaybackTick);
        tokenSprite.currentAnimation = null;
        
        // Ensure final position
        tokenSprite.position.set(finalX, finalY);
        this.updateUIPosition?.(tokenId, finalX, finalY);
        
        // Update store with final position
        this.moveToken(tokenId, finalX, finalY);
        
        // Remove from animating set
        this.animatingTokens.delete(tokenId);
        this.onTokenAnimationEnd?.(tokenId);
      }
    };

    // Store animation reference
    tokenSprite.currentAnimation = pathPlaybackTick;
    
    // Add to ticker
    if (this.pixiApp) {
      this.pixiApp.ticker.add(pathPlaybackTick);
    }
  }

  cancelAnimation(tokenId: string): void {
    const tokenSprite = this.getTokenSprite?.(tokenId);
    if (!tokenSprite) return;
    
    // Clear any existing animation
    if (tokenSprite.currentAnimation) {
      this.pixiApp?.ticker.remove(tokenSprite.currentAnimation);
      tokenSprite.currentAnimation = null;
    }
    
    // Remove from animating tokens set
    if (this.animatingTokens.has(tokenId)) {
      this.animatingTokens.delete(tokenId);
      this.onTokenAnimationEnd?.(tokenId);
    }
  }

  private interpolatePathPosition(
    path: Array<{x: number, y: number, timestamp: number}>, 
    currentTime: number
  ): {x: number, y: number} {
    if (path.length === 0) {
      return { x: 0, y: 0 };
    }
    
    if (path.length === 1) {
      const firstPoint = path[0];
      return firstPoint ? { x: firstPoint.x, y: firstPoint.y } : { x: 0, y: 0 };
    }
    
    // Find the two points to interpolate between
    let beforeIndex = 0;
    let afterIndex = 1;
    
    for (let i = 0; i < path.length - 1; i++) {
      const currentPoint = path[i];
      const nextPoint = path[i + 1];
      
      if (!currentPoint || !nextPoint) continue;
      
      if (currentTime >= currentPoint.timestamp && currentTime <= nextPoint.timestamp) {
        beforeIndex = i;
        afterIndex = i + 1;
        break;
      }
    }
    
    // Handle edge cases
    const firstPoint = path[0];
    if (firstPoint && currentTime <= firstPoint.timestamp) {
      return { x: firstPoint.x, y: firstPoint.y };
    }
    
    const lastPoint = path[path.length - 1];
    if (lastPoint && currentTime >= lastPoint.timestamp) {
      return { x: lastPoint.x, y: lastPoint.y };
    }
    
    // Interpolate between the two points
    const beforePoint = path[beforeIndex];
    const afterPoint = path[afterIndex];
    
    if (!beforePoint || !afterPoint) {
      const fallbackPoint = firstPoint || { x: 0, y: 0 };
      return { x: fallbackPoint.x, y: fallbackPoint.y };
    }
    
    const timeDelta = afterPoint.timestamp - beforePoint.timestamp;
    const progress = timeDelta > 0 ? (currentTime - beforePoint.timestamp) / timeDelta : 0;
    
    return {
      x: beforePoint.x + (afterPoint.x - beforePoint.x) * progress,
      y: beforePoint.y + (afterPoint.y - beforePoint.y) * progress
    };
  }

  // Callbacks setup

  setPixiApp(app: Application | null): void {
    this.pixiApp = app;
  }

  setTokensChangedCallback(callback: (tokens: Record<string, TokenEntity>, prevTokens: Record<string, TokenEntity>) => void): void {
    this.onTokensChanged = callback;
  }

  setAnimationStartCallback(callback: (tokenId: string) => void): void {
    this.onTokenAnimationStart = callback;
  }

  setAnimationEndCallback(callback: (tokenId: string) => void): void {
    this.onTokenAnimationEnd = callback;
  }

  setTokenSpriteProvider(provider: (tokenId: string) => TokenGroupContainer | null): void {
    this.getTokenSprite = provider;
  }

  setUIPositionUpdater(updater: (tokenId: string, x: number, y: number) => void): void {
    this.updateUIPosition = updater;
  }

  setControlsPositionUpdater(updater: (x: number, y: number, tokenSize: number) => void): void {
    this.updateControlsPosition = updater;
  }

  destroyAll(): void {
    // Unsubscribe from state changes
    this.unsubscribeFromSource?.();
    
    if (this.animateTokenToPositionHandler) {
      this.eventBus.off('animate-token-to-position', this.animateTokenToPositionHandler);
      this.animateTokenToPositionHandler = null;
    }
    if (this.animateTokenPathHandler) {
      this.eventBus.off('animate-token-path', this.animateTokenPathHandler);
      this.animateTokenPathHandler = null;
    }
    
    // Cancel all active animations
    for (const tokenId of this.animatingTokens) {
      this.cancelAnimation(tokenId);
    }
    
    // Clear state
    this.animatingTokens.clear();
    this.pendingTokenSync = null;
    this.pixiApp = null;
  }
}
