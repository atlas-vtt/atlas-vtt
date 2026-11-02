import type { DungeonModel } from '../model';
import type { DungeonStyle, DungeonView } from '../style';
import { drawDungeon } from './drawDungeon';
import type { Canvas2D } from './geometry';
import { mapLayout, type MapLayout } from './layoutSize';
import { legibleStyle } from './legibleStyle';
import { createRenderEnv } from './renderEnv';
import { SvgCanvas } from './svgCanvas';
import { drawVellum } from './vellum';
import { visibleDungeon } from './visibleDungeon';

export interface RenderMapOptions {
  pxPerCell: number;
  /** Leave the paper out, for an image laid over something else. */
  transparent?: boolean;
  /**
   * Only what an SVG can hold, as the SVG export draws it: plain paper instead of the vellum, and
   * no textures, soft shadows or other pictures (a canvas that cannot draw pictures gets the same).
   */
  vector?: boolean;
  /** The floor to draw, by index; the entry floor where unset. */
  floor?: number;
  /** Holes over a floor below: transparent (`cut`, where unset) or painted as depth (`drawn`). */
  openings?: 'cut' | 'drawn';
  /**
   * Keeps hatching and strokes readable where cells are small (`legibleStyle`), for a picture
   * this many times the 1400 × 1000 the legible size is given for: the preview's.
   */
  legibleAt?: number;
  /** A part of the map to draw, the canvas its size; the whole map where unset. */
  window?: { originCell: { x: number; y: number }; widthPx: number; heightPx: number };
}

/**
 * The floor plan of one floor, which is all a dungeon is drawn as: nothing written on it. The
 * canvas must be the layout's size (`mapLayout`, the same for every floor); pixel (0, 0) is the
 * corner of the returned origin cell.
 */
export function renderMap(ctx: Canvas2D, model: DungeonModel, style: DungeonStyle, view: DungeonView, options: RenderMapOptions): MapLayout {
  const { pxPerCell } = options;
  const layout = mapLayout(model, pxPerCell, view);
  const drawn = options.legibleAt ? legibleStyle(style, pxPerCell / options.legibleAt) : style;
  const env = createRenderEnv(ctx, visibleDungeon(model, view, options.floor ?? 0), drawn, view, pxPerCell, options.openings);
  const frame = options.window ? { ...options.window, pxPerCell } : { originCell: layout.originCell, widthPx: layout.widthPx, heightPx: layout.heightPx, pxPerCell };
  ctx.save();
  if (!options.transparent) {
    // The vellum lies over the whole map: a window shows its part of it.
    ctx.save();
    ctx.translate((layout.originCell.x - frame.originCell.x) * pxPerCell, (layout.originCell.y - frame.originCell.y) * pxPerCell);
    // An engraving is printed on smooth paper: its skin shows less grain.
    drawVellum(ctx, env.palette.paper, layout, model.seed, view.monochrome || options.vector === true, drawn.direction === 'engraved' ? 0.35 : 1);
    ctx.restore();
  }
  ctx.scale(pxPerCell, pxPerCell);
  ctx.translate(-frame.originCell.x, -frame.originCell.y);
  drawDungeon(env, frame, options.vector !== true);
  ctx.restore();
  return layout;
}

/** The floor plan as an SVG document, drawn by the same code into a context that writes SVG. */
export function renderMapSvg(model: DungeonModel, style: DungeonStyle, view: DungeonView, options: RenderMapOptions): { svg: string; layout: MapLayout } {
  const size = mapLayout(model, options.pxPerCell, view);
  const svg = new SvgCanvas(size.widthPx, size.heightPx);
  // The recorder offers every part of the 2D context the renderer uses.
  // An SVG has no way to cut holes: they are painted as depth.
  const layout = renderMap(svg as unknown as Canvas2D, model, style, view, { ...options, openings: 'drawn' });
  return { svg: svg.toSvg(), layout };
}

/** The pixels per cell that fit the whole map into `width` × `height` pixels. */
export function fittedPxPerCell(model: DungeonModel, view: DungeonView, width: number, height: number): number {
  const { cellsWide, cellsHigh } = mapLayout(model, 1, view);
  return Math.max(1e-3, Math.min(width / cellsWide, height / cellsHigh));
}
