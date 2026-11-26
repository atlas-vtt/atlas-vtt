import { getDomHost } from '../../host/dom';
import { CanvasSource, Texture } from 'pixi.js';
import { PIN_ICON_PATHS, type PinIconId } from '../../types/pinIcons';

/** Edge length of a rasterised pin glyph, sharp on a badge at full zoom on high-density screens. */
export const PIN_ICON_TEXTURE_SIZE = 128;
/** Pin icons are drawn on a 512×512 canvas. */
const ICON_SPACE = 512;
/** Lucide icons are drawn on a 24×24 canvas. */
const LINE_ICON_SPACE = 24;

/**
 * Rasterises a pin icon in white, to be tinted per pin and theme, so every pin
 * showing the icon shares one texture. Null where no 2D canvas is available.
 */
export function createPinIconTexture(id: PinIconId): Texture | null {
  return createGlyphTexture(PIN_ICON_PATHS[id]);
}

/** A canvas of `size` pixels drawn on by `draw`, as a texture with mipmaps. Null where no 2D canvas is available. */
function rasterise(size: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture | null {
  const canvas = getDomHost().createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  // Mipmaps keep the glyph clean when the map is zoomed out and markers grow small on screen
  return new Texture({
    source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }),
  });
}

/** The white raster of a glyph path drawn on the icons' 512×512 canvas, `size` pixels wide, with mipmaps. */
export function createGlyphTexture(path: string, size: number = PIN_ICON_TEXTURE_SIZE): Texture | null {
  return rasterise(size, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.scale(size / ICON_SPACE, size / ICON_SPACE);
    ctx.fill(new Path2D(path));
  });
}

/**
 * The white raster of a glyph drawn as lines: `paths` are the paths of a Lucide icon on its
 * 24×24 canvas, stroked as Lucide strokes them. `size` pixels wide, with mipmaps.
 */
export function createLineGlyphTexture(paths: readonly string[], size: number = PIN_ICON_TEXTURE_SIZE): Texture | null {
  return rasterise(size, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.scale(size / LINE_ICON_SPACE, size / LINE_ICON_SPACE);
    for (const path of paths) ctx.stroke(new Path2D(path));
  });
}
