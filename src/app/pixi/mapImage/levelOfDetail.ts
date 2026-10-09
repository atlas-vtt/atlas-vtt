/** Which pyramid level and tiles a view needs, and in what order to load them. Pure: no PIXI, no DOM. */
import { TILE_CONTENT, tileWorldRect, type PixelRect, type Pyramid, type TileRef } from './pyramid';

/** A level's texels must cover at least this many screen pixels, so no level is minified more than 2×. */
export const MIN_TEXEL_SCREEN_PX = 0.5;

/** Keeps float noise (zoom × resolution landing a hair above a power of two) from picking a finer level. */
const LEVEL_EPSILON = 1e-9;

/** A camera, the GM's or a demand region's: what it shows and how many world units one screen pixel spans. */
export interface TileView {
  rect: PixelRect;
  worldPerScreenPixel: number;
}

/**
 * The finest level whose texels cover at least half a screen pixel:
 * `clamp(ceil(log2(0.5 × worldPerScreenPixel / decodedScale)), 0, last)`.
 */
export function levelFor(pyramid: Pyramid, worldPerScreenPixel: number): number {
  const last = pyramid.levels.length - 1;
  // NaN and non-positive scales read as the finest level; Infinity reaches the last through the clamp.
  if (!(worldPerScreenPixel > 0)) return 0;
  const decodedScale = pyramid.levels[0]?.scale ?? 1;
  const level = Math.ceil(Math.log2((MIN_TEXEL_SCREEN_PX * worldPerScreenPixel) / decodedScale) - LEVEL_EPSILON);
  return Math.min(last, Math.max(0, level));
}

/**
 * The tiles of `level` that `worldRect` touches, widened by `prefetch` tiles on every side and clamped to
 * the level's grid; none when the rect lies outside the map or has no area. Row-major order.
 */
export function visibleTiles(pyramid: Pyramid, level: number, worldRect: PixelRect, prefetch = 1): TileRef[] {
  const grid = pyramid.levels[level];
  if (!grid) return [];
  const { x, y, width, height } = worldRect;
  if (!(width > 0) || !(height > 0)) return [];
  if (x >= pyramid.width || y >= pyramid.height || x + width <= 0 || y + height <= 0) return [];
  const tileWorldX = TILE_CONTENT * grid.scaleX;
  const tileWorldY = TILE_CONTENT * grid.scaleY;
  const ring = Math.max(0, Math.floor(prefetch));
  const firstCol = Math.max(0, Math.floor(x / tileWorldX) - ring);
  const firstRow = Math.max(0, Math.floor(y / tileWorldY) - ring);
  const lastCol = Math.min(grid.cols - 1, Math.ceil((x + width) / tileWorldX) - 1 + ring);
  const lastRow = Math.min(grid.rows - 1, Math.ceil((y + height) / tileWorldY) - 1 + ring);
  const tiles: TileRef[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) tiles.push({ level, col, row });
  }
  return tiles;
}

/**
 * A picture of `size` pixels framed on the centred crop of `rect` with the picture's aspect (a
 * thumbnail), rendered at no more than one pixel per world unit; null when `rect` has no area.
 */
export function pictureView(rect: PixelRect, size: { width: number; height: number }): TileView | null {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isFinite) || !(width > 0) || !(height > 0)) return null;
  const aspect = size.width / size.height;
  const cropWidth = Math.min(width, height * aspect);
  const cropHeight = Math.min(height, width / aspect);
  return {
    rect: { x: x + (width - cropWidth) / 2, y: y + (height - cropHeight) / 2, width: cropWidth, height: cropHeight },
    worldPerScreenPixel: Math.max(1, cropWidth / size.width, cropHeight / size.height),
  };
}

/** The tiles a view wants: those of its level of detail it touches, plus the prefetch ring. */
export function tilesForView(pyramid: Pyramid, view: TileView, prefetch = 1): TileRef[] {
  return visibleTiles(pyramid, levelFor(pyramid, view.worldPerScreenPixel), view.rect, prefetch);
}

/** How urgently a tile is needed by a view; lower sorts first. */
export interface TilePriority {
  /** 0 on the view's level, then 1, 2… levels away, coarser before finer at the same distance. */
  levelRank: number;
  /** World distance from the tile's centre to the view's centre. */
  distance: number;
}

/** A tile's priority for one view: its level of detail first, then nearness to the view's centre. */
export function tilePriority(pyramid: Pyramid, tile: TileRef, view: TileView): TilePriority {
  const target = levelFor(pyramid, view.worldPerScreenPixel);
  const steps = Math.abs(tile.level - target);
  const levelRank = steps === 0 ? 0 : steps * 2 - (tile.level > target ? 1 : 0);
  const rect = tileWorldRect(pyramid, tile);
  const dx = rect.x + rect.width / 2 - (view.rect.x + view.rect.width / 2);
  const dy = rect.y + rect.height / 2 - (view.rect.y + view.rect.height / 2);
  return { levelRank, distance: Math.hypot(dx, dy) };
}

export function compareTilePriority(a: TilePriority, b: TilePriority): number {
  return a.levelRank - b.levelRank || a.distance - b.distance;
}

/**
 * `tiles` in load order for every view at once: each tile ranks by the view that needs it most. Ties keep
 * the input order, so a caller's order (e.g. row-major) breaks them deterministically.
 */
export function orderByPriority(pyramid: Pyramid, tiles: readonly TileRef[], views: readonly TileView[]): TileRef[] {
  const [first, ...others] = views;
  if (!first) return [...tiles];
  const ranked = tiles.map((tile, index) => {
    let best = tilePriority(pyramid, tile, first);
    for (const view of others) {
      const other = tilePriority(pyramid, tile, view);
      if (compareTilePriority(other, best) < 0) best = other;
    }
    return { tile, index, priority: best };
  });
  ranked.sort((a, b) => compareTilePriority(a.priority, b.priority) || a.index - b.index);
  return ranked.map(entry => entry.tile);
}
