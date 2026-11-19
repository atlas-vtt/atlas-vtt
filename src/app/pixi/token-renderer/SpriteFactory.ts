import { syncTokenArtwork } from './tokenArtwork';
/**
 * Token Sprite Factory
 * 
 * Handles creation and management of token sprites and containers.
 */

import { Container, Graphics, Sprite, Circle, Texture, CanvasSource } from 'pixi.js';
import type { ITokenSpriteFactory, TokenGroupContainer } from './types';
import type { TokenEntity } from '../../types';
import type { GridSystem } from '../../grid/GridSystem';
import { destroyTree } from '../utils/destroyTree';
import { getTokenRingOuterDiameter } from './tokenRingMetrics';
import { loadedTokenRingTexture, loadTokenRingTexture } from './tokenRingTexture';
import { computeTokenPixelSize, computeTokenStrokeWidth } from './tokenSizing';

// Cached textures - generated once, reused for all tokens
let cachedGlassTexture: Texture | null = null;

export class SpriteFactory implements ITokenSpriteFactory {
  private gridSystem: GridSystem;
  public isPlayerView: boolean;
  private onTokenRingTextureReady: (() => void) | undefined;
  private ringTextureLoad: Promise<Texture | null> | null = null;

  constructor(gridSystem: GridSystem, isPlayerView: boolean = false) {
    this.gridSystem = gridSystem;
    this.isPlayerView = isPlayerView;
  }

  async createTokenSprite(token: TokenEntity, texture: Texture): Promise<TokenGroupContainer> {
    const { tokenSize, strokeWidth } = this.calculateTokenSize(token);

    const tokenGroup: TokenGroupContainer = Object.assign(new Container(), {
      tokenId: token.id,
      tokenData: token,
      tokenSize,
      artPath: token.imagePath ?? '',
      strokeWidth,
    });
    tokenGroup.label = 'tokenGroup';
    tokenGroup.sortableChildren = true;
    tokenGroup.zIndex = token.layer || 0;
    tokenGroup.position.set(token.x, token.y);
    tokenGroup.eventMode = 'passive';
    // Children stay hit-testable so resize/rotate handles parented to the group receive pointer events
    tokenGroup.interactiveChildren = true;

    // Create the token sprite
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = tokenSize;
    sprite.height = tokenSize;
    sprite.zIndex = 0;
    sprite.label = 'tokenSprite';
    sprite.eventMode = 'none';
    sprite.interactive = false;

    // Create circular mask
    const circleMask = new Graphics();
    circleMask.label = 'tokenArtMask';
    const maskRadius = tokenSize / 2;
    circleMask.circle(0, 0, maskRadius);
    circleMask.fill(0xffffff);
    circleMask.eventMode = 'none';
    circleMask.interactive = false;
    sprite.mask = circleMask;

    // Create invisible background for z-ordering (no longer interactive)
    const tokenBackground = new Graphics();
    tokenBackground.circle(0, 0, maskRadius);
    tokenBackground.fill({ color: 0x000000, alpha: 0 });
    tokenBackground.eventMode = 'none';
    tokenBackground.interactive = false;
    tokenBackground.zIndex = -10;
    tokenBackground.label = 'tokenBackground';

    // Apply rotation to sprite if specified
    if (token.rotation) {
      sprite.rotation = (token.rotation * Math.PI) / 180;
    }

    // Add children to container
    tokenGroup.addChild(tokenBackground);
    tokenGroup.addChild(circleMask);
    tokenGroup.addChild(sprite);

    // Add glass dome overlay for polished look
    this.createGlassOverlay(tokenGroup, tokenSize);

    // Create token ring with default or specified color
    const defaultRingColor = '#ffffff';
    const ringColor = token.ringColor || defaultRingColor;
    this.createTokenRing(tokenGroup, ringColor);

    return tokenGroup;
  }

  updateTokenSize(tokenId: string, container: TokenGroupContainer, size: number): void {
    const { tokenSize, strokeWidth } = this.calculateTokenSizeFromMultiplier(size);
    
    // Update sprite size
    const sprite = container.getChildByLabel('tokenSprite') as Sprite;
    if (sprite) {
      sprite.width = tokenSize;
      sprite.height = tokenSize;
    }

    // Update mask
    const maskRadius = tokenSize / 2;
    const circleMask = sprite?.mask as Graphics;
    if (circleMask) {
      circleMask.clear();
      circleMask.circle(0, 0, maskRadius);
      circleMask.fill(0xffffff);
      circleMask.hitArea = new Circle(0, 0, maskRadius);
    }

    // Update hit area
    if (sprite) {
      sprite.hitArea = new Circle(0, 0, maskRadius);
    }

    // Update background
    const tokenBackground = container.getChildByLabel('tokenBackground') as Graphics;
    if (tokenBackground) {
      tokenBackground.clear();
      tokenBackground.circle(0, 0, maskRadius);
      tokenBackground.fill({ color: 0x000000, alpha: 0 });
      tokenBackground.hitArea = new Circle(0, 0, maskRadius);
    }

    // Update glass dome overlay
    const glassOverlay = container.getChildByLabel('glassOverlay') as Sprite;
    if (glassOverlay) {
      glassOverlay.width = tokenSize;
      glassOverlay.height = tokenSize;
    }

    // Store updated size metadata
    container.tokenSize = tokenSize;
    container.strokeWidth = strokeWidth;
    syncTokenArtwork(container, tokenSize);
  }

  updateTokenPosition(container: Container, x: number, y: number): void {
    container.position.set(x, y);
  }

  /** Turns the token's art and its ring, never the container: its UI and glass stay upright. */
  updateTokenRotation(container: Container, rotation: number): void {
    const radians = (rotation * Math.PI) / 180;
    const sprite = container.getChildByLabel('tokenSprite');
    if (sprite) sprite.rotation = radians;
    const ring = container.getChildByLabel('tokenRing');
    if (ring) ring.rotation = radians;
  }

  setTokenRingTextureReadyCallback(callback: (() => void) | undefined): void {
    this.onTokenRingTextureReady = callback;

    if (callback && loadedTokenRingTexture()) {
      callback();
    }
  }

  preloadTokenRingTexture(): Promise<Texture | null> {
    const loaded = loadedTokenRingTexture();
    if (loaded) return Promise.resolve(loaded);

    // One pending load per factory, so tokens created meanwhile announce the texture once.
    this.ringTextureLoad ??= loadTokenRingTexture().then((texture) => {
      this.ringTextureLoad = null;
      if (texture) this.onTokenRingTextureReady?.();
      return texture;
    });
    return this.ringTextureLoad;
  }

  createTokenRing(container: TokenGroupContainer, ringColor: string | null, tokenSizeOverride?: number): Sprite | Graphics | null {
    // Remove all existing ring layers before recreating.
    // This prevents stale/doubled shadows when a ring is refreshed.
    for (let i = container.children.length - 1; i >= 0; i--) {
      const child = container.children[i];
      if (child?.label === 'tokenRing' || child?.label === 'tokenRingShadow') {
        container.removeChild(child);
        child.destroy();
      }
    }

    syncTokenArtwork(container, container.tokenSize ?? 70);
    if (!ringColor || container.tokenData?.showRing === false) {
      return null;
    }

    const tokenSize = typeof tokenSizeOverride === 'number' && Number.isFinite(tokenSizeOverride) && tokenSizeOverride > 0
      ? tokenSizeOverride
      : (container.tokenSize || 70);
    const baseTokenSize = container.tokenSize || tokenSize;
    const strokeWidth = container.strokeWidth || computeTokenStrokeWidth(this.gridSystem.getOptions().size);
    const ringScale = baseTokenSize > 0 ? tokenSize / baseTokenSize : 1;
    const ringSize = getTokenRingOuterDiameter(tokenSize, strokeWidth, ringScale);
    const parsedColor = Number.parseInt(ringColor.replace('#', ''), 16);
    const ringTint = Number.isFinite(parsedColor) ? parsedColor : 0xffffff;
    const ringTexture = this.getTokenRingTexture();

    if (!ringTexture || ringTexture === Texture.EMPTY) {
      return this.createFallbackRing(container, tokenSize, ringSize, ringTint);
    }

    const ring = new Sprite(ringTexture);
    ring.label = 'tokenRing';
    ring.anchor.set(0.5);
    ring.width = ringSize;
    ring.height = ringSize;
    ring.zIndex = 2;
    ring.eventMode = 'none';
    ring.interactive = false;
    ring.tint = ringTint;
    // The ring turns with the art it frames
    ring.rotation = container.getChildByLabel('tokenSprite')?.rotation ?? 0;

    container.addChild(ring);
    return ring;
  }

  private getTokenRingTexture(): Texture | null {
    const loaded = loadedTokenRingTexture();
    if (!loaded) void this.preloadTokenRingTexture();
    return loaded;
  }

  private createFallbackRing(container: Container, tokenSize: number, ringSize: number, ringTint: number): Graphics {
    // Fallback keeps rings visible if the textured asset has not finished loading yet.
    const fallbackRing = new Graphics();
    fallbackRing.label = 'tokenRing';
    fallbackRing.zIndex = 2;
    fallbackRing.eventMode = 'none';
    fallbackRing.interactive = false;

    // Use a stable stroke that matches token->ring padding.
    const strokeWidth = Math.max(2, (ringSize - tokenSize) / 2);
    const radius = Math.max(0, ringSize / 2 - strokeWidth / 2);

    fallbackRing.circle(0, 0, radius);
    fallbackRing.stroke({
      width: strokeWidth,
      color: ringTint,
      alpha: 0.95,
      alignment: 0.5,
    });

    container.addChild(fallbackRing);
    return fallbackRing;
  }

  /**
   * Creates and caches a high-quality glass dome texture.
   */
  private getGlassTexture(): Texture {
    if (cachedGlassTexture) {
      return cachedGlassTexture;
    }

    const size = 512;
    const canvas = createEl('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Create clipping circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    // Layer 1: Edge vignette
    const vignetteGradient = ctx.createRadialGradient(
      centerX, centerY, radius * 0.3,
      centerX, centerY, radius
    );
    vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGradient.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    vignetteGradient.addColorStop(0.65, 'rgba(0, 0, 0, 0.03)');
    vignetteGradient.addColorStop(0.75, 'rgba(0, 0, 0, 0.08)');
    vignetteGradient.addColorStop(0.82, 'rgba(0, 0, 0, 0.15)');
    vignetteGradient.addColorStop(0.88, 'rgba(0, 0, 0, 0.25)');
    vignetteGradient.addColorStop(0.93, 'rgba(0, 0, 0, 0.35)');
    vignetteGradient.addColorStop(0.97, 'rgba(0, 0, 0, 0.45)');
    vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.55)');

    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, size, size);

    // Layer 2: Main specular highlight
    ctx.save();
    const highlightGradient = ctx.createRadialGradient(
      centerX, centerY - radius * 0.15, radius * 0.1,
      centerX, centerY - radius * 0.15, radius * 0.85
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    highlightGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.06)');
    highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = highlightGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer 3: Soft diffused specular glow (no hard core)
    const dotX = centerX - radius * 0.32;
    const dotY = centerY - radius * 0.35;
    const dotGlow = ctx.createRadialGradient(
      dotX, dotY, 0,
      dotX, dotY, radius * 0.4
    );
    dotGlow.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    dotGlow.addColorStop(0.4, 'rgba(255, 255, 255, 0.06)');
    dotGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = dotGlow;
    ctx.beginPath();
    ctx.arc(dotX, dotY, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Layer 4: Smaller secondary diffused glow
    const dot2X = centerX - radius * 0.18;
    const dot2Y = centerY - radius * 0.5;
    const dot2Glow = ctx.createRadialGradient(
      dot2X, dot2Y, 0,
      dot2X, dot2Y, radius * 0.22
    );
    dot2Glow.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    dot2Glow.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
    dot2Glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = dot2Glow;
    ctx.beginPath();
    ctx.arc(dot2X, dot2Y, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Layer 5: Rim light at bottom
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 2, Math.PI * 0.15, Math.PI * 0.85);
    const rimGradient = ctx.createLinearGradient(
      centerX - radius, centerY + radius * 0.7,
      centerX + radius, centerY + radius * 0.7
    );
    rimGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    rimGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)');
    rimGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    rimGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    rimGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = rimGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    const glassSource = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
    cachedGlassTexture = new Texture({ source: glassSource });
    return cachedGlassTexture;
  }

  createGlassOverlay(container: Container, tokenSize: number): Sprite {
    // Use cached glass texture or create it once
    const glassTexture = this.getGlassTexture();
    
    const glassOverlay = new Sprite(glassTexture);
    glassOverlay.label = 'glassOverlay';
    glassOverlay.anchor.set(0.5);
    glassOverlay.width = tokenSize;
    glassOverlay.height = tokenSize;
    glassOverlay.zIndex = 1;
    glassOverlay.eventMode = 'none';
    glassOverlay.interactive = false;
    
    container.addChild(glassOverlay);
    
    return glassOverlay;
  }

  destroyTokenSprite(container: Container): void {
    // The art mask, ring and badges are all children of the group
    destroyTree(container);
  }

  // Private helper methods

  private calculateTokenSize(token: TokenEntity): { tokenSize: number; strokeWidth: number } {
    return this.calculateTokenSizeFromMultiplier(token.size || 1);
  }

  private calculateTokenSizeFromMultiplier(sizeMultiplier: number): { tokenSize: number; strokeWidth: number } {
    const gridSize = this.gridSystem.getOptions().size;
    return {
      tokenSize: computeTokenPixelSize(gridSize, sizeMultiplier),
      strokeWidth: computeTokenStrokeWidth(gridSize),
    };
  }
}
