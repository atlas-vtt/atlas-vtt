import type { Viewport } from 'pixi-viewport';
import type { TokenEntity } from '../types';
import { computeTokenPixelSize } from './token-renderer/tokenSizing';
import { allowZoom } from './zoomRange';

/** Focus at a readable CSS-pixel diameter, leaving context in small panes. */
export function focusToken(viewport: Viewport, token: Pick<TokenEntity, 'x' | 'y' | 'size'>, gridSize: number): void {
  const diameter = computeTokenPixelSize(gridSize, token.size || 1);
  const screenDiameter = Math.min(160, viewport.screenWidth / 3, viewport.screenHeight / 3);
  const scale = screenDiameter / diameter;
  if (!Number.isFinite(diameter) || diameter <= 0 || !Number.isFinite(scale) || scale <= 0) return;

  // The default limits cannot accommodate every map resolution.
  allowZoom(viewport, scale);

  viewport.animate({
    position: { x: token.x, y: token.y },
    scale,
    time: 400,
    ease: 'easeInOutCubic',
  });
}

/** The smallest a token is shown, in CSS pixels, when a click elsewhere brings it into view: its art still reads beside its controls. */
export const READABLE_TOKEN_PX = 40;

/**
 * Brings `token` to the middle of the view at the zoom the GM chose, zooming in only so far that
 * it is shown `READABLE_TOKEN_PX` wide where it would be smaller; never out.
 */
export function panToToken(viewport: Viewport, token: Pick<TokenEntity, 'x' | 'y' | 'size'>, gridSize: number): void {
  const diameter = computeTokenPixelSize(gridSize, token.size || 1);
  const current = viewport.scale.x;
  const readable = Number.isFinite(diameter) && diameter > 0 ? READABLE_TOKEN_PX / diameter : current;
  const scale = Math.max(current, readable);
  allowZoom(viewport, scale);
  viewport.animate({
    position: { x: token.x, y: token.y },
    scale,
    time: 400,
    ease: 'easeInOutCubic',
  });
}
