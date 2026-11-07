/**
 * Token Renderer Type Definitions
 * 
 * These interfaces model the current behavior of the TokenRenderer class
 * to enable future refactoring into focused modules.
 */

import type { Container, Graphics, Sprite, Texture, Application, TickerCallback } from 'pixi.js';
import type { TokenEntity } from '../../types';
import type { GridSystem } from '../../grid/GridSystem';
import type { TokenUIRenderer } from '../TokenUIRenderer';

/**
 * A token's root container. `SpriteFactory` attaches the metadata when it
 * builds the container, so every token container in the renderer carries it.
 */
export interface TokenGroupContainer extends Container {
  tokenId: string;
  tokenData: TokenEntity;
  /** Rendered diameter in world pixels. */
  tokenSize: number;
  /** Image path whose texture this group holds in the `TextureCache`. */
  artPath: string;
  strokeWidth: number;
  /** Ticker callback of the movement animation in flight, if any. */
  currentAnimation?: TickerCallback<unknown> | null;
}

/** How far a selected token's bars stand out, in world units: to either side of its centre, and below its bottom edge. */
export interface BarsSpan {
  readonly halfWidth: number;
  readonly reach: number;
}

/** Round drag handle drawn by the token resize and rotation UIs. */
export interface TokenHandleContainer extends Container {
  bg: Graphics;
  isDarkMode: boolean;
  iconSprite?: Sprite;
  direction?: string;
}

/**
 * Token sprite creation and management
 */
export interface ITokenSpriteFactory {
  /**
   * Creates a complete token container with all visual elements
   * @param token The token entity data
   * @param texture The loaded texture for the token
   * @returns Promise resolving to the created container with token visuals
   */
  createTokenSprite(token: TokenEntity, texture: Texture): Promise<TokenGroupContainer>;
  
  /**
   * Updates the size of a token sprite based on grid changes
   * @param tokenId The token identifier
   * @param container The token container to update
   * @param size The new size multiplier
   */
  updateTokenSize(tokenId: string, container: TokenGroupContainer, size: number): void;
  
  /**
   * Updates the position of a token sprite
   * @param container The token container to update
   * @param x The new x coordinate
   * @param y The new y coordinate
   */
  updateTokenPosition(container: Container, x: number, y: number): void;
  
  /**
   * Updates the rotation of a token sprite
   * @param container The token container to update
   * @param rotation The rotation in degrees
   */
  updateTokenRotation(container: Container, rotation: number): void;
  
  /**
   * Destroys a token group with all of its children, including their geometry
   * @param container The token container to destroy
   */
  destroyTokenSprite(container: Container): void;
}

/**
 * Token art, decoded once per image and shared by every token that shows it.
 * Every user holds the art it shows, and held art is never destroyed.
 */
export interface ITextureCache {
  /**
   * Loads (or reuses) an image's texture and holds it until `release` is called with the same path
   * @param imagePath The token's image path; tokens without one get the default texture
   */
  acquire(imagePath: string): Promise<Texture>;

  /**
   * Drops one hold taken by `acquire`
   * @param imagePath The path passed to `acquire`
   */
  release(imagePath: string): void;

  /**
   * Destroys every texture nothing holds, except those of `keepImagePaths`
   * @param keepImagePaths Images the scene shows or is about to load, kept decoded
   */
  evictUnused(keepImagePaths: Iterable<string>): void;

  /**
   * Re-reads art whose file changed into a new texture and destroys the old one
   * @param show Puts the new texture on every sprite that shows the old one
   * @returns False when the art is not cached from the vault
   */
  reload(imagePath: string, show: (texture: Texture) => void): Promise<boolean>;

  /**
   * Destroys all cached textures and clears cache
   */
  destroyAll(): void;
}

/**
 * Token UI overlay management (HP bars, nameplates, etc.)
 */
export interface ITokenUIManager {
  /**
   * Creates UI elements for a token
   * @param tokenId The token identifier
   * @param container The token container to attach UI to
   * @param token The token entity data
   * @returns The TokenUIRenderer instance or null if not a character token
   */
  createTokenUI(tokenId: string, container: TokenGroupContainer, token: TokenEntity): TokenUIRenderer | null;
  
  /**
   * Updates UI elements for a token
   * @param tokenId The token identifier
   * @param token The updated token entity data
   */
  updateTokenUI(tokenId: string, token: TokenEntity): void;
  
  /**
   * Updates selection UI for tokens
   * @param selectedTokenIds Array of selected token IDs
   */
  updateSelectionUI(selectedTokenIds: string[]): void;
  
  /**
   * Shows token controls UI (rotation, resize handles)
   * @param tokenId The token identifier
   * @param container The token container
   */
  showTokenControls(tokenId: string, container: Container): void;
  
  /**
   * Hides token controls UI
   */
  hideTokenControls(): void;
  
  /**
   * Destroys UI elements for a token
   * @param tokenId The token identifier
   */
  destroyTokenUI(tokenId: string): void;
  
  /**
   * Destroys all UI elements
   */
  destroyAll(): void;
}

/**
 * Token interaction handling (pointer events, context menus)
 */
export interface ITokenInteractionController {
  /**
   * Attaches interaction handlers to a token
   * @param tokenId The token identifier
   * @param container The token container
   * @param token The token entity data
   */
  attachInteractionHandlers(tokenId: string, container: Container, token: TokenEntity): void;
  
  /**
   * Removes interaction handlers from a token
   * @param tokenId The token identifier
   * @param container The token container
   */
  removeInteractionHandlers(tokenId: string, container: Container): void;
  
  /**
   * Sets up hover handlers for a token
   * @param tokenId The token identifier
   * @param container The token container
   * @param onHover Callback for hover start
   * @param onHoverEnd Callback for hover end
   */
  setupHoverHandlers(
    tokenId: string, 
    container: Container,
    onHover: (tokenId: string) => void,
    onHoverEnd: (tokenId: string) => void
  ): void;
  
  /**
   * Handles drag operations
   * @param tokenId The token identifier
   * @param startX Starting X coordinate
   * @param startY Starting Y coordinate
   * @param onMove Callback for drag movement
   * @param onEnd Callback for drag end
   */
  handleDrag(
    tokenId: string,
    startX: number,
    startY: number,
    onMove: (x: number, y: number) => void,
    onEnd: (finalX: number, finalY: number, path: Array<{x: number, y: number, timestamp: number}>) => void
  ): void;
  
  /**
   * Emits context menu event
   * @param tokenId The token identifier
   * @param x Screen X coordinate
   * @param y Screen Y coordinate
   */
  emitContextMenu(tokenId: string, x: number, y: number): void;
  
  /**
   * Cleans up all interaction handlers
   */
  destroyAll(): void;
}

/**
 * Token state synchronization between store and visuals
 */
export interface ITokenSyncService {
  /**
   * Initializes synchronization with the store
   */
  initialize(): void;
  
  /**
   * Forces synchronization of pending tokens
   */
  forceSyncTokens(): void;
  
  /**
   * Checks if a token is currently animating
   * @param tokenId The token identifier
   * @returns True if the token is animating
   */
  isTokenAnimating(tokenId: string): boolean;
  
  /**
   * Animates a token to a target position
   * @param tokenId The token identifier
   * @param targetX Target X coordinate
   * @param targetY Target Y coordinate
   */
  animateTokenToPosition(
    tokenId: string, 
    targetX: number, 
    targetY: number,
    options?: {
      transient?: boolean;
    }
  ): void;
  
  /**
   * Plays back a recorded token path
   * @param tokenId The token identifier
   * @param finalX Final X coordinate
   * @param finalY Final Y coordinate
   * @param path Array of path points with timestamps
   * @param originalDuration Duration of the original movement
   */
  playTokenPath(
    tokenId: string,
    finalX: number,
    finalY: number,
    path: Array<{x: number, y: number, timestamp: number}>,
    originalDuration: number
  ): void;
  
  /**
   * Cancels any ongoing animation for a token
   * @param tokenId The token identifier
   */
  cancelAnimation(tokenId: string): void;
  
  /**
   * Cleans up synchronization subscriptions
   */
  destroyAll(): void;
}

/**
 * Composite interface for the complete token renderer
 * This represents the current TokenRenderer's public API
 */
export interface ITokenRenderer {
  /**
   * Sets the PIXI application reference
   * @param app The PIXI application
   */
  setPixiApp(app: Application | null): void;
  
  /**
   * Gets the container holding all tokens
   * @returns The token container
   */
  getTokenContainer(): Container;
  
  /**
   * Gets all token sprites
   * @returns Record of token IDs to containers
   */
  getTokenSprites(): Record<string, Container>;
  
  /**
   * Updates all token sizes (typically after grid change)
   */
  updateAllTokenSizes(): void;
  
  /**
   * Sets callback for when all tokens are loaded
   * @param callback Function to call when loading completes
   */
  onWhenAllTokensLoaded(callback: () => void): void;
  
  /**
   * Destroys the token renderer and cleans up resources
   */
  destroy(): void;
}

/**
 * Configuration options for token renderer modules
 */
export interface ITokenRendererConfig {
  viewId?: string;
  gridSystem: GridSystem;
  pixiApp?: Application;
}
