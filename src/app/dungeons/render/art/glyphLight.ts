import { pointsBounds, rotate, type Bounds, type Vec } from '../geometry';
import type { GlyphPen } from '../glyphPen';
import { TO_LIGHT } from './light';
import type { Field, PathFn } from './paths';

/**
 * The one light inside a glyph. A glyph is drawn in its own frame, turned with the piece, but the
 * light stands at the map's top left: each helper turns what it is given into the map's frame,
 * turns the context back by the glyph's rotation and lets the painter's hand light it there, so a
 * piece at any turn is lit, shaded and given its shade lines on the same sides of the map.
 */

/** Towards the light, in the glyph's own frame. */
export function lightInGlyph(pen: GlyphPen): Vec {
  return rotate(TO_LIGHT, -pen.rotation);
}

/** Runs `draw` with the context turned back into the map's orientation, about the glyph's centre. */
function inMapFrame(pen: GlyphPen, draw: () => void): void {
  pen.ctx.save();
  pen.ctx.rotate(-pen.rotation);
  draw();
  pen.ctx.restore();
}

/** A polygon's edges as the painter marks them, standing up (`raised`) or falling away: lit lip and shade, or shade lines. */
export function glyphEdges(pen: GlyphPen, poly: readonly Vec[], raised: boolean): void {
  const turned = poly.map(p => rotate(p, pen.rotation));
  inMapFrame(pen, () => pen.hand.edges(turned, raised));
}

/** Models a rounded part within `path` (already filled), lit from the map's top left. */
export function glyphSolid(pen: GlyphPen, path: PathFn, centre: Vec, radius: number, strength?: number): void {
  const { ctx } = pen;
  const c = rotate(centre, pen.rotation);
  const r = radius * 2;
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  inMapFrame(pen, () => pen.hand.solid(p => p.rect(c.x - r, c.y - r, r * 2, r * 2), c, radius, strength));
  ctx.restore();
}

/**
 * Darkens by `field` (0..1, in the glyph's frame) within `bounds`, inside `clip` if given: a
 * hollow's depth or a shadow, in the painter's tone (Engraved's hatching keeps its angle on the map).
 */
export function glyphTone(pen: GlyphPen, field: Field, bounds: Bounds, clip: PathFn | null, kind: 'shade' | 'depth'): void {
  const { ctx } = pen;
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ].map(p => rotate(p, pen.rotation));
  const inGlyph = (x: number, y: number): number => {
    const p = rotate({ x, y }, -pen.rotation);
    return field(p.x, p.y);
  };
  ctx.save();
  if (clip) {
    ctx.beginPath();
    clip(ctx);
    ctx.clip();
  }
  inMapFrame(pen, () => pen.hand.tone(inGlyph, pointsBounds(corners), null, kind));
  ctx.restore();
}
