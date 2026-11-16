import { Graphics, Sprite } from 'pixi.js';
import { tokenArtBox } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';

/** Keep full, unframed artwork proportional when a token is placed or resized. */
export function syncTokenArtwork(container: TokenGroupContainer, size: number): void {
  const sprite = container.getChildByLabel('tokenSprite');
  if (!(sprite instanceof Sprite)) return;
  const framed = container.tokenData?.showRing !== false;
  const mask = container.getChildByLabel('tokenArtMask');
  if (mask instanceof Graphics) {
    mask.clear().circle(0, 0, size / 2).fill(0xffffff);
    sprite.mask = framed ? mask : null;
    mask.visible = framed;
  }
  const glass = container.getChildByLabel('glassOverlay');
  if (glass) glass.visible = framed;
  const box = tokenArtBox(size, container.strokeWidth, framed, sprite.texture.width, sprite.texture.height);
  sprite.width = box.width;
  sprite.height = box.height;
}

/** Fits the artwork to the token again after its texture changed. */
export function fitTokenArtwork(container: TokenGroupContainer): void {
  const size = container.tokenSize;
  if (Number.isFinite(size) && size > 0) syncTokenArtwork(container, size);
}
