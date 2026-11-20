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

/** A glide across the screen takes longer the further it goes, within these bounds, so a short hop stays quick and a long one stays calm. */
const GLIDE_MIN_MS = 450;
const GLIDE_MAX_MS = 950;
const GLIDE_MS_PER_SCREEN = 600;
/** A token already this close to the middle (a share of the smaller side) is left where it is: no hop for a few pixels. */
const CENTRED_SHARE = 0.08;

/**
 * Brings `token` to the middle of the view at the zoom the GM chose, zooming in only so far that
 * it is shown `READABLE_TOKEN_PX` wide where it would be smaller; never out. The camera glides, gentle at both ends
 * (a sine), for longer the further it goes; a token already in the middle at that zoom leaves it still.
 */
export function panToToken(viewport: Viewport, token: Pick<TokenEntity, 'x' | 'y' | 'size'>, gridSize: number): void {
  const diameter = computeTokenPixelSize(gridSize, token.size || 1);
  const current = viewport.scale.x;
  const readable = Number.isFinite(diameter) && diameter > 0 ? READABLE_TOKEN_PX / diameter : current;
  const scale = Math.max(current, readable);
  // How far the token is from the middle, in screen pixels
  const centre = viewport.center;
  const distance = Math.hypot(token.x - centre.x, token.y - centre.y) * current;
  const screen = Math.min(viewport.screenWidth, viewport.screenHeight);
  if (scale === current && distance < screen * CENTRED_SHARE) return;
  allowZoom(viewport, scale);
  const reach = screen > 0 ? distance / screen : 1;
  viewport.animate({
    position: { x: token.x, y: token.y },
    scale,
    time: Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, GLIDE_MIN_MS + reach * GLIDE_MS_PER_SCREEN)),
    ease: 'easeInOutSine',
  });
}
