import type { Container, Graphics, Sprite } from 'pixi.js';
import type { TokenEntity } from '../../types';

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
