import type { Bounds, Canvas2D } from '../geometry';

/** Rows of the picture a layer is painted in at a time, so no layer needs a map-sized canvas. */
const STRIP = 1024;

let scratch: OffscreenCanvas | null = null;

/** One strip canvas for every layer, grown as needed and kept. */
function scratchOf(width: number, height: number): OffscreenCanvas {
  if (!scratch || scratch.width < width || scratch.height < height) {
    scratch = new OffscreenCanvas(Math.max(width, scratch?.width ?? 0), Math.max(height, scratch?.height ?? 0));
  }
  return scratch;
}

/** The picture a layer is painted over: its size in device pixels. */
export interface LayerTarget {
  ctx: Canvas2D;
  widthPx: number;
  heightPx: number;
}

/** The device pixels `area` (in the context's frame) covers, within the picture. */
function pixelsOf(target: LayerTarget, m: DOMMatrix, area?: Bounds): { x0: number; y0: number; x1: number; y1: number } {
  const all = { x0: 0, y0: 0, x1: target.widthPx, y1: target.heightPx };
  if (!area) return all;
  const corners = [
    [area.minX, area.minY],
    [area.maxX, area.minY],
    [area.minX, area.maxY],
    [area.maxX, area.maxY],
  ].map(([x, y]) => ({ x: m.a * x! + m.c * y! + m.e, y: m.b * x! + m.d * y! + m.f }));
  return {
    x0: Math.max(all.x0, Math.floor(Math.min(...corners.map(p => p.x))) - 1),
    y0: Math.max(all.y0, Math.floor(Math.min(...corners.map(p => p.y))) - 1),
    x1: Math.min(all.x1, Math.ceil(Math.max(...corners.map(p => p.x))) + 1),
    y1: Math.min(all.y1, Math.ceil(Math.max(...corners.map(p => p.y))) + 1),
  };
}

/**
 * Paints `painter` (drawing in cells, as the map's context does) on a layer of its own and lays the
 * layer onto the map with `composite`, strip by strip, over `area` only where given. A layer is
 * where masking happens: a texture drawn, then cut by a soft mask (`destination-in`) before it
 * reaches the map.
 */
export function paintLayer(target: LayerTarget, composite: GlobalCompositeOperation, painter: (ctx: Canvas2D) => void, area?: Bounds): void {
  const main = target.ctx;
  const m = main.getTransform();
  const { x0, y0, x1, y1 } = pixelsOf(target, m, area);
  const width = x1 - x0;
  if (width <= 0 || y1 <= y0) return;
  const stripHeight = Math.max(1, Math.min(STRIP, y1 - y0));
  const canvas = scratchOf(width, stripHeight);
  const ctx = canvas.getContext('2d')!;
  for (let top = y0; top < y1; top += stripHeight) {
    const rows = Math.min(stripHeight, y1 - top);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, rows);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, rows);
    ctx.clip();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - top);
    painter(ctx);
    ctx.restore();
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = composite;
    main.drawImage(canvas, 0, 0, width, rows, x0, top, width, rows);
    main.restore();
  }
}
