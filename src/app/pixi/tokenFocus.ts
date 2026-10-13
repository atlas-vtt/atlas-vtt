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
