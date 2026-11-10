import type { Graphics, Texture } from 'pixi.js';
import { canvasBadgeColors, isDarkTheme } from './utils/canvasBadgeColors';
import { createLucideIconTexture } from './utils/lucideIconTexture';

/** Lucide's RotateCw, the glyph of every rotate handle on the map. */
const ROTATE_ICON = '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>';

/** The share of a handle's diameter its glyph takes. */
export const ROTATE_ICON_SHARE = 0.6;

/** The rotate glyph in the ink of the light or dark theme, rasterised large enough to stay sharp on this display. */
export function rotateIconTexture(dark: boolean): Promise<Texture> {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 4);
  return createLucideIconTexture(ROTATE_ICON, dark ? '#ffffff' : '#000000', Math.round(24 * pixelRatio * 2));
}

/**
 * Paints a rotate handle's disc of `radius` in the canvas badges' colours (the status badges' look),
 * a little stronger while `emphasised`: hovered, or held while it turns something.
 */
export function paintRotateHandle(disc: Graphics, radius: number, emphasised: boolean): void {
  const { background, stroke } = canvasBadgeColors();
  const strokeAlpha = (isDarkTheme() ? 0.4 : 0.3) * (emphasised ? 1.5 : 1);
  disc.clear()
    .circle(0, 0, radius)
    .fill({ color: background, alpha: emphasised ? 1 : 0.95 })
    .stroke({ width: 0.5, color: stroke, alpha: strokeAlpha });
}
