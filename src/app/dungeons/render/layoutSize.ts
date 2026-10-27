import type { DungeonModel } from '../model';
import type { DungeonView } from '../style';
import { DEFAULT_VIEW } from '../style';
import { dungeonBounds } from './visibleDungeon';

/** Largest side a map image may have (WebP's limit, as for imported maps). */
export const MAX_MAP_SIDE = 16_383;
/** Largest number of pixels a map image may have. */
export const MAX_MAP_PIXELS = 144_000_000;
/** Whole cells of paper around the floors: room for the hatching, its strokes and the exits. */
const MAP_MARGIN_CELLS = 2;
/**
 * A scene's map is drawn at this many pixels per cell (less where `SCENE_MAP_PIXELS` demands it):
 * the top of the 70–150 px a cell VTTs recommend for map art (Owlbear Rodeo). The map keeps its own
 * grid lines, so it reads the same when exported; exports choose their own size (`CellSizeDialog`).
 */
export const DEFAULT_PX_PER_CELL = 150;
/**
 * Most pixels a scene's map is drawn with, fewer than a map may have (`MAX_MAP_PIXELS`), for the
 * WebP encoder's sake. Chromium's encoder writes the modes of all macroblocks into one partition of
 * at most 512 KB, and where a picture overflows it, it encodes the whole picture again for every
 * overflow: the maps measured overflowed from about 100 MP (a 143 MP floor took 17 s, 80 MP 3 s).
 * Below that a floor encodes in about 40 ns a pixel, and two floors of this size fit the image
 * workers' memory budget together (8 bytes a pixel each), so a dungeon's floors encode two at a time.
 */
export const SCENE_MAP_PIXELS = 64_000_000;
/** The WebP quality a scene's map is stored at: no difference to 0.92 to see at play zoom, 2–3 MB a floor. */
export const SCENE_MAP_QUALITY = 0.85;

/**
 * Where a map image lies on the grid: its pixel (0, 0) is the corner of cell `originCell`. Every
 * floor's image has the same layout, around all floors, so they lie over each other exactly.
 */
export interface MapLayout {
  originCell: { x: number; y: number };
  /** In cells. */
  cellsWide: number;
  cellsHigh: number;
  widthPx: number;
  heightPx: number;
  pxPerCell: number;
}

export function mapLayout(model: DungeonModel, pxPerCell: number, view: Pick<DungeonView, 'secrets'> = DEFAULT_VIEW): MapLayout {
  const bounds = dungeonBounds(model, view);
  const minX = Math.floor(bounds.minX) - MAP_MARGIN_CELLS;
  const minY = Math.floor(bounds.minY) - MAP_MARGIN_CELLS;
  const cellsWide = Math.ceil(bounds.maxX) + MAP_MARGIN_CELLS - minX;
  const cellsHigh = Math.ceil(bounds.maxY) + MAP_MARGIN_CELLS - minY;
  return {
    originCell: { x: minX, y: minY },
    cellsWide,
    cellsHigh,
    widthPx: Math.round(cellsWide * pxPerCell),
    heightPx: Math.round(cellsHigh * pxPerCell),
    pxPerCell,
  };
}

export function mapPixelSize(model: DungeonModel, pxPerCell: number, view: Pick<DungeonView, 'secrets'> = DEFAULT_VIEW): { width: number; height: number } {
  const layout = mapLayout(model, pxPerCell, view);
  return { width: layout.widthPx, height: layout.heightPx };
}

/** The most pixels per cell (whole pixels) that keep the image within both limits, and within `maxPixels` where given. */
export function maxPxPerCell(model: DungeonModel, view: Pick<DungeonView, 'secrets'> = DEFAULT_VIEW, maxPixels = MAX_MAP_PIXELS): number {
  const { cellsWide, cellsHigh } = mapLayout(model, 1, view);
  const bySide = MAX_MAP_SIDE / Math.max(cellsWide, cellsHigh);
  const byArea = Math.sqrt(Math.min(maxPixels, MAX_MAP_PIXELS) / (cellsWide * cellsHigh));
  return Math.max(1, Math.floor(Math.min(bySide, byArea)));
}

/** The cell size to draw a map at: the one asked for, or less where the limits (and `maxPixels`) demand it. */
export function suggestedPxPerCell(model: DungeonModel, wanted = DEFAULT_PX_PER_CELL, view: Pick<DungeonView, 'secrets'> = DEFAULT_VIEW, maxPixels?: number): number {
  return Math.max(1, Math.min(Math.round(wanted), maxPxPerCell(model, view, maxPixels)));
}
