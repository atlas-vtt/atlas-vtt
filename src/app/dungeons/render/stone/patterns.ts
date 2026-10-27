import type { Canvas2D } from '../geometry';

/** A pattern of a tile covering `cells` cells, offset by (`ox`, `oy`) cells, for a context drawing in cells. */
export function cellPattern(ctx: Canvas2D, tile: OffscreenCanvas, cells: number, ox = 0, oy = 0, angle = 0): CanvasPattern {
  const pattern = ctx.createPattern(tile, 'repeat')!;
  const k = cells / tile.width;
  const c = Math.cos(angle) * k;
  const s = Math.sin(angle) * k;
  pattern.setTransform(new DOMMatrix([c, s, -s, c, ox, oy]));
  return pattern;
}
