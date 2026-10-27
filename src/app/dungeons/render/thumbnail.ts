import type { DungeonModel } from '../model';
import type { DungeonStyle, DungeonView } from '../style';
import { pointsBounds, roomCentre, type Bounds, type Canvas2D, type Vec } from './geometry';
import { paletteOf } from './palette';
import { renderMap } from './renderMap';
import { visibleDungeon } from './visibleDungeon';

/**
 * A style's card in the gallery: a window of the dungeon at a size where its walls, surroundings,
 * water and props all show, rather than the whole map shrunk until its hatching is a smudge. It
 * shows the entry floor.
 */

/** Cells across a thumbnail. */
export const THUMBNAIL_CELLS_ACROSS = 11;

/** What weighs, per cell of a window, in choosing where a thumbnail looks. */
const WATER_WEIGHT = 0.5;
const PROP_WEIGHT = 2;
const COLUMN_WEIGHT = 1;
/** The most floor one room counts for, in cells: a card shows several rooms, not one large hall. */
const ROOM_CAP = 16;

function overlap(a: Bounds, b: Bounds): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

function inside(box: Bounds, p: Vec): boolean {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

/**
 * The top left corner, in cells, of the `cellsWide` × `cellsHigh` window that holds the most of
 * the dungeon: floor (each room up to `ROOM_CAP`), then water, props and columns, each window
 * centred on a room or a pool.
 */
export function thumbnailWindow(model: DungeonModel, view: DungeonView, cellsWide: number, cellsHigh: number): Vec {
  const dungeon = visibleDungeon(model, view);
  const rooms = dungeon.rooms.map(room => ({ minX: room.x, minY: room.y, maxX: room.x + room.w, maxY: room.y + room.h }));
  const pools = view.water ? dungeon.floor.water.map(pool => pointsBounds(pool.outline)) : [];
  const props = view.props ? dungeon.floor.props.filter(prop => dungeon.roomShapes.has(prop.room)) : [];
  const centres = [...dungeon.rooms.map(roomCentre), ...pools.map(b => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }))];
  let best: Vec = { x: dungeon.bounds.minX, y: dungeon.bounds.minY };
  let bestScore = -1;
  for (const centre of centres) {
    const corner = { x: Math.round(centre.x - cellsWide / 2), y: Math.round(centre.y - cellsHigh / 2) };
    const box = { minX: corner.x, minY: corner.y, maxX: corner.x + cellsWide, maxY: corner.y + cellsHigh };
    let score = 0;
    for (const room of rooms) score += Math.min(ROOM_CAP, overlap(room, box));
    for (const pool of pools) score += overlap(pool, box) * WATER_WEIGHT;
    for (const prop of props) if (inside(box, prop)) score += PROP_WEIGHT;
    for (const column of dungeon.floor.columns) if (inside(box, column)) score += COLUMN_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = corner;
    }
  }
  return best;
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  /** How many times the 1400 × 1000 picture the legible size is given for this one is (`legibleStyle`). */
  legibleAt: number;
}

/** Draws the thumbnail onto a canvas of `width` × `height`. */
export function renderThumbnail(ctx: Canvas2D, model: DungeonModel, style: DungeonStyle, view: DungeonView, options: ThumbnailOptions): void {
  const pxPerCell = options.width / THUMBNAIL_CELLS_ACROSS;
  const corner = thumbnailWindow(model, view, THUMBNAIL_CELLS_ACROSS, options.height / pxPerCell);
  ctx.save();
  // Paper past the map's edge too; only the window is drawn.
  ctx.fillStyle = paletteOf(style, view).paper;
  ctx.fillRect(0, 0, options.width, options.height);
  renderMap(ctx, model, style, view, { pxPerCell, legibleAt: options.legibleAt, window: { originCell: corner, widthPx: options.width, heightPx: options.height } });
  ctx.restore();
}
