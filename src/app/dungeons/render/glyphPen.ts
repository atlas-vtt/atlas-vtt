import type { Hand, Material } from './art/hand';
import type { Canvas2D } from './geometry';
import type { Palette } from './palette';
import type { GlyphDraw, PropGlyph } from './propShapes';
import type { RenderEnv } from './renderEnv';

/**
 * The drawing grammar every glyph of a dungeon map shares (props and passages): a silhouette inked
 * at the outline weight and filled with the palette's fill, softly rounded corners, a bevel (an
 * inset contour at the fine weight, joined to the corners by mitres) where a thing is cut from
 * stone, grain or bands where it is built of wood, solid ink only for small accents, and depth
 * shown as ink that grows darker towards what lies lower. Two colours always (ink and fill, water
 * where there is water), so every glyph survives Monochrome. All sizes in cells.
 */
export interface GlyphPen {
  ctx: Canvas2D;
  palette: Palette;
  /** The width of inner detail; the outline is the context's current line width. */
  fine: number;
  /** What cloth is filled with (a statue's drapery); the fill where unset. */
  cloth?: string;
  /** The painter's hand, for a part's texture (`hand.grain`); light it only through `art/glyphLight.ts`. */
  hand: Hand;
  /** The glyph's turn on the map, radians, and its scale: the context is turned and scaled by both. */
  rotation: number;
  scale: number;
  /** The colours of a part made of another material than the glyph's own. */
  paint: (material: Material) => { fill: string; ink: string };
}

/** One drawing for both painters: the eleven first props, which the hands finish each in its manner. */
export function bothPainters(draw: GlyphDraw): Pick<PropGlyph, 'stone' | 'engraved'> {
  return { stone: draw, engraved: draw };
}

/**
 * A glyph's two weights, in cells: its outline between the style's normal and thin strokes, its
 * detail at the thin stroke but never under half the outline, so small things stay drawn and
 * never heavier than the walls around them.
 */
export function glyphWeights(env: Pick<RenderEnv, 'style' | 'px'>): { outline: number; fine: number } {
  const { normal, thin } = env.style.strokes;
  const outline = (normal + thin) / 2;
  // Style strokes are reference pixels; `px` is one of them in cells.
  return { outline: outline * env.px, fine: Math.max(thin, outline * 0.5) * env.px };
}

/** The corner radius of every block. */
export const CORNER = 0.035;
/** How far a bevel's inner contour lies inside its block. */
export const BEVEL = 0.07;

/** A rounded rectangle's path, centred on (x, y). */
export function roundedRect(ctx: CanvasPath, x: number, y: number, w: number, h: number, r = CORNER): void {
  const left = x - w / 2;
  const top = y - h / 2;
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(left + radius, top);
  ctx.arcTo(left + w, top, left + w, top + h, radius);
  ctx.arcTo(left + w, top + h, left, top + h, radius);
  ctx.arcTo(left, top + h, left, top, radius);
  ctx.arcTo(left, top, left + w, top, radius);
  ctx.closePath();
}

/** A filled, outlined block: the silhouette of anything with corners. */
export function block(pen: GlyphPen, x: number, y: number, w: number, h: number, fill = pen.palette.fill, r = CORNER): void {
  const { ctx } = pen;
  ctx.beginPath();
  roundedRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

/** A circle's path, centred on (x, y). */
export function circlePath(ctx: CanvasPath, r: number, x = 0, y = 0): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** A filled, outlined disc. */
export function disc(pen: GlyphPen, x: number, y: number, r: number, fill = pen.palette.fill): void {
  const { ctx } = pen;
  ctx.beginPath();
  circlePath(ctx, r, x, y);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

/** A solid ink accent. */
export function inkDot(pen: GlyphPen, x: number, y: number, r: number): void {
  const { ctx } = pen;
  ctx.beginPath();
  circlePath(ctx, r, x, y);
  ctx.fillStyle = pen.palette.ink;
  ctx.fill();
}

/** Strokes the current path at the fine weight. */
export function strokeFine(pen: GlyphPen): void {
  const { ctx } = pen;
  ctx.save();
  ctx.lineWidth = pen.fine;
  ctx.stroke();
  ctx.restore();
}

/** Fine lines, given as x0, y0, x1, y1 quadruples. */
export function fineLines(pen: GlyphPen, coords: readonly number[]): void {
  const { ctx } = pen;
  ctx.beginPath();
  for (let i = 0; i < coords.length; i += 4) {
    ctx.moveTo(coords[i]!, coords[i + 1]!);
    ctx.lineTo(coords[i + 2]!, coords[i + 3]!);
  }
  strokeFine(pen);
}

/** A fine circle. */
export function fineRing(pen: GlyphPen, x: number, y: number, r: number): void {
  pen.ctx.beginPath();
  circlePath(pen.ctx, r, x, y);
  strokeFine(pen);
}

/**
 * The bevel of a stone block centred on (x, y): its inner contour `inset` inside, and a mitre
 * from each corner of the block to the same corner of the contour, so the block reads as cut.
 */
export function bevel(pen: GlyphPen, x: number, y: number, w: number, h: number, inset = BEVEL): void {
  const { ctx } = pen;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  ctx.beginPath();
  roundedRect(ctx, x, y, iw, ih, CORNER * 0.5);
  // The mitres start where the outline's rounded corner is at 45°.
  const k = CORNER * (1 - Math.SQRT1_2);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    ctx.moveTo(x + sx * (w / 2 - k), y + sy * (h / 2 - k));
    ctx.lineTo(x + sx * (iw / 2), y + sy * (ih / 2));
  }
  strokeFine(pen);
}

/** A closed polygon's path from x, y pairs. */
export function polygonPath(ctx: CanvasPath, points: readonly number[]): void {
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.closePath();
}
