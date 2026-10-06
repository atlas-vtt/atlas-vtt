import { getDomHost } from '../../host/dom';
import { CanvasSource, Texture } from 'pixi.js';
import { PIN_ICON_PATHS, type PinIconId } from '../../types/pinIcons';

/** Edge length of a rasterised pin glyph, sharp on a badge at full zoom on high-density screens. */
export const PIN_ICON_TEXTURE_SIZE = 128;
/** Pin icons are drawn on a 512×512 canvas. */
const ICON_SPACE = 512;

/**
 * Rasterises a pin icon in white, to be tinted per pin and theme, so every pin
 * showing the icon shares one texture. Null where no 2D canvas is available.
 */
export function createPinIconTexture(id: PinIconId): Texture | null {
  return createGlyphTexture(PIN_ICON_PATHS[id]);
}

/** The white raster of a glyph path drawn on the icons' 512×512 canvas, `size` pixels wide, with mipmaps. */
export function createGlyphTexture(path: string, size: number = PIN_ICON_TEXTURE_SIZE): Texture | null {
  const canvas = getDomHost().createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.scale(size / ICON_SPACE, size / ICON_SPACE);
  ctx.fill(new Path2D(path));

  // Mipmaps keep the glyph clean when the map is zoomed out and markers grow small on screen
  return new Texture({
    source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }),
  });
}
