import { generateDungeon } from '../generate';
import type { DungeonModel, DungeonRequest } from '../model';
import { mapLayout, mapPixelSize, suggestedPxPerCell, type MapLayout } from '../render/layoutSize';
import { fittedPxPerCell, renderMap, renderMapSvg } from '../render/renderMap';
import { renderThumbnail, THUMBNAIL_CELLS_ACROSS } from '../render/thumbnail';
import type { DungeonStyle, DungeonView } from '../style';

/**
 * What the dungeon worker does: generate a dungeon (or take one as it is) and draw its floor plan
 * on an `OffscreenCanvas`. Runs in the worker, or in the window where no worker can start.
 */

/** The picture size sizes of a map's strokes are judged against (`legibleStyle`). */
const LEGIBLE_PICTURE = { width: 1400, height: 1000 };

export type DungeonOutput =
  /**
   * The floor plan at `pxPerCell`, or less where the image would pass a map's limits; a PNG, a
   * bitmap, or with `svg` an SVG document. `transparent` leaves the paper out. `floor` is the
   * floor drawn, by index (the entry floor where unset); every floor's image has the same layout.
   * `maxPixels` holds the image to fewer pixels than a map may have (`SCENE_MAP_PIXELS`).
   */
  | { kind: 'map'; pxPerCell: number; maxPixels?: number; bitmap?: boolean; svg?: boolean; transparent?: boolean; floor?: number }
  /** The floor plan fitted into `width` × `height` pixels, as a bitmap: the preview. */
  | { kind: 'preview'; width: number; height: number; floor?: number }
  /** A window of the dungeon, as a bitmap: a style's card in the gallery (`renderThumbnail`). */
  | { kind: 'thumbnail'; width: number; height: number; legibleAt: number };

export interface DungeonJob {
  request: DungeonRequest;
  /** A dungeon to draw as it is (wings the GM hid); unset generates it from `request`. */
  model?: DungeonModel;
  style: DungeonStyle;
  view: DungeonView;
  output: DungeonOutput;
}

export type RenderedImage = { type: 'png'; blob: Blob } | { type: 'bitmap'; bitmap: ImageBitmap } | { type: 'svg'; svg: string };

export interface DungeonRendered {
  model: DungeonModel;
  image: RenderedImage;
  /** Where the image lies on the grid: its pixel (0, 0) is the corner of `originCell`. */
  map: MapLayout;
}

export interface DungeonWorkerMessage {
  id: number;
  job: DungeonJob;
}

export type DungeonWorkerReply = { id: number; ok: true; result: DungeonRendered } | { id: number; ok: false; message: string };

function canvasOf(width: number, height: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the dungeon: no 2D canvas.');
  return { canvas, ctx };
}

function previewOf(model: DungeonModel, job: DungeonJob, { width, height, floor }: Extract<DungeonOutput, { kind: 'preview' }>): DungeonRendered {
  const pxPerCell = fittedPxPerCell(model, job.view, Math.max(1, width), Math.max(1, height));
  const size = mapPixelSize(model, pxPerCell, job.view);
  const { canvas, ctx } = canvasOf(size.width, size.height);
  const legibleAt = Math.min(width / LEGIBLE_PICTURE.width, height / LEGIBLE_PICTURE.height);
  const map = renderMap(ctx, model, job.style, job.view, { pxPerCell, legibleAt, ...(floor !== undefined && { floor }) });
  return { model, map, image: { type: 'bitmap', bitmap: canvas.transferToImageBitmap() } };
}

function thumbnailOf(model: DungeonModel, job: DungeonJob, output: Extract<DungeonOutput, { kind: 'thumbnail' }>): DungeonRendered {
  const { canvas, ctx } = canvasOf(output.width, output.height);
  renderThumbnail(ctx, model, job.style, job.view, output);
  // The bitmap is a window of the map; `map` is the whole map's layout at the thumbnail's cell size.
  return { model, map: mapLayout(model, output.width / THUMBNAIL_CELLS_ACROSS, job.view), image: { type: 'bitmap', bitmap: canvas.transferToImageBitmap() } };
}

export async function runDungeonJob(job: DungeonJob): Promise<DungeonRendered> {
  const { style, view, output } = job;
  const model = job.model ?? generateDungeon(job.request);
  if (output.kind === 'preview') return previewOf(model, job, output);
  if (output.kind === 'thumbnail') return thumbnailOf(model, job, output);
  const pxPerCell = suggestedPxPerCell(model, output.pxPerCell, view, output.maxPixels);
  const options = {
    pxPerCell,
    ...(output.transparent ? { transparent: true } : {}),
    ...(output.floor !== undefined && { floor: output.floor }),
  };
  if (output.svg) {
    const { svg, layout } = renderMapSvg(model, style, view, options);
    return { model, map: layout, image: { type: 'svg', svg } };
  }
  // The canvas must have the size of the layout renderMap draws
  const size = mapPixelSize(model, pxPerCell, view);
  const { canvas, ctx } = canvasOf(size.width, size.height);
  const map = renderMap(ctx, model, style, view, options);
  const image: RenderedImage = output.bitmap
    ? { type: 'bitmap', bitmap: canvas.transferToImageBitmap() }
    : { type: 'png', blob: await canvas.convertToBlob({ type: 'image/png' }) };
  return { model, map, image };
}
