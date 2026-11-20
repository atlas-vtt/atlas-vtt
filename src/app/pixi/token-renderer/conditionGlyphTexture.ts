import { CanvasSource, Texture } from 'pixi.js';
import { WIDGET_ICON_PATHS } from '../../types/widgetIcons';
import type { ConditionGlyph } from '../../utils/conditionGlyph';

/** Edge length of a rasterised glyph, sharp on a badge at full zoom on high-density screens. */
const GLYPH_TEXTURE_SIZE = 128;
/** Widget icons are drawn on a 512×512 canvas. */
const ICON_SPACE = 512;
/** The face every badge's letters and numbers are set in. */
export const GLYPH_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

/**
 * Glyphs are rasterised in white and tinted per badge, so every badge that shows the
 * same icon or letter shares one texture, whatever its colour.
 */
const glyphTextures = new Map<string, Texture>();

/** The glyph's texture, or null where no 2D canvas is available. */
export function getConditionGlyphTexture(glyph: ConditionGlyph): Texture | null {
  const key = glyph.kind === 'icon' ? `icon:${glyph.icon}` : `text:${glyph.text}`;
  const cached = glyphTextures.get(key);
  if (cached) return cached;

  const canvas = createEl('canvas');
  canvas.width = GLYPH_TEXTURE_SIZE;
  canvas.height = GLYPH_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  if (glyph.kind === 'icon') drawIcon(ctx, WIDGET_ICON_PATHS[glyph.icon]);
  else drawText(ctx, glyph.text);

  // Mipmaps keep the glyph clean when the map is zoomed out and the badge is a few pixels wide
  const texture = new Texture({
    source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }),
  });
  glyphTextures.set(key, texture);
  return texture;
}

function drawIcon(ctx: CanvasRenderingContext2D, path: string): void {
  const scale = GLYPH_TEXTURE_SIZE / ICON_SPACE;
  ctx.scale(scale, scale);
  ctx.fill(new Path2D(path));
}

/** Centres `text` on its ink rather than its line box, shrinking it to fit longer counts like "+12". */
function drawText(ctx: CanvasRenderingContext2D, text: string): void {
  const maxWidth = GLYPH_TEXTURE_SIZE * 0.92;
  let fontSize = GLYPH_TEXTURE_SIZE * 0.78;
  ctx.font = `700 ${fontSize}px ${GLYPH_FONT_FAMILY}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    fontSize *= maxWidth / width;
    ctx.font = `700 ${fontSize}px ${GLYPH_FONT_FAMILY}`;
  }
  const metrics = ctx.measureText(text);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const inkMiddle = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  ctx.fillText(text, GLYPH_TEXTURE_SIZE / 2, GLYPH_TEXTURE_SIZE / 2 + inkMiddle);
}
