import { glyphPainterOf } from '../../style';
import type { GlyphPen } from '../glyphPen';
import type { GlyphFit, PropGlyph } from '../propShapes';
import { glyphSolid } from './glyphLight';
import type { Hand, Material } from './hand';

/** Where a glyph stands: its centre in cells, its turn, its scale and the size it is drawn at. */
export interface GlyphPlace {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  fit: GlyphFit;
}

/**
 * Draws a glyph of the family (`glyphPen.ts`) in a direction's hand, with that painter's drawing:
 * its fills in the material's colours and its outline in the material's ink, then, inside its
 * silhouette, the material's texture and the modelling of the one light, which keeps to the map's
 * frame however it is turned.
 */
export function drawGlyph(hand: Hand, place: GlyphPlace, glyph: PropGlyph, water: string, cloth: string): void {
  const { ctx, palette, style } = hand.scene.env;
  const fill = hand.fillAt?.(place.x, place.y);
  const paintOf = (material: Material): { fill: string; ink: string } => {
    const paint = hand.paint(material);
    return fill === undefined ? paint : { ...paint, fill };
  };
  const paint = paintOf(glyph.material);
  const { fit } = place;
  ctx.save();
  ctx.translate(place.x, place.y);
  ctx.rotate(place.rotation);
  ctx.scale(place.scale, place.scale);
  ctx.strokeStyle = paint.ink;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = hand.weight('outline') / place.scale;
  const pen: GlyphPen = {
    ctx,
    palette: { ...palette, fill: paint.fill, ink: paint.ink, water },
    fine: hand.weight('fine') / place.scale,
    cloth,
    hand,
    rotation: place.rotation,
    scale: place.scale,
    paint: paintOf,
  };
  glyph[glyphPainterOf(style.direction)](pen, fit);
  const { silhouette } = glyph;
  if (silhouette) hand.grain(path => silhouette(path, fit), glyph.material);
  if (silhouette && glyph.dome) glyphSolid(pen, path => silhouette(path, fit), { x: 0, y: 0 }, glyph.radius, 0.9);
  ctx.restore();
}
