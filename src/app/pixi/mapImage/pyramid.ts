/**
 * Geometry of a map image's tile pyramid (Deep Zoom layout). Pure: no PIXI, no DOM.
 *
 * Level 0 is the decoded image; level n is `ceil(size / 2ⁿ)` of it. Every level is cut into tiles of
 * `TILE_CONTENT` px of content, each bitmap carrying `TILE_OVERLAP` px of its neighbours on every inner
 * side, so bilinear filtering at a seam reads the neighbour's real pixel. World units are the source's
 * natural pixels, whatever size it was decoded at.
 */

/** Content pixels per tile side; with the overlap on both sides a bitmap is at most 512 px. */
export const TILE_CONTENT = 510;
/** Pixels each tile bitmap carries of its neighbour, on inner sides only. */
export const TILE_OVERLAP = 1;
/** Bumped whenever tile size, overlap, quality or the level rule change: cached pyramids of another spec are rebuilt. */
export const TILE_SPEC = 1;
/** The overview is the finest level whose longer side is at most this (at most 16 tiles). */
export const OVERVIEW_MAX_SIDE = 2048;

export interface PyramidLevel {
  index: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** Nominal world units per level pixel, 2ⁿ × the decoded scale: what level of detail is chosen by. */
  scale: number;
  /**
   * Exact world units per level pixel along each axis (world size / level size). Level sizes round up, so
   * these are a hair below `scale`; drawing with them makes every level cover the world exactly, so a
   * coarse tile under finer ones never drifts towards the far edge.
   */
  scaleX: number;
  scaleY: number;
}

export interface Pyramid {
  /** World size, = the source's natural size. */
  width: number;
  height: number;
  levels: PyramidLevel[];
  /** Index of the overview level. */
  overview: number;
}

export interface TileRef {
  level: number;
  col: number;
  row: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function assertSize(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer, got ${value}`);
}

/**
 * The pyramid of a source of `sourceWidth` × `sourceHeight` natural pixels. A source decoded smaller than
 * its natural size (the scaled JPEG path) passes `decodedScale` (natural px per decoded px): level 0 is then
 * `ceil(size / decodedScale)` and every level's `scale` grows by that factor, while the world size stays the
 * natural size. The last level is the first whose longer side fits one tile.
 */
export function pyramidOf(sourceWidth: number, sourceHeight: number, decodedScale = 1): Pyramid {
  assertSize(sourceWidth, 'sourceWidth');
  assertSize(sourceHeight, 'sourceHeight');
  if (!Number.isFinite(decodedScale) || decodedScale < 1) {
    throw new RangeError(`decodedScale must be a finite number of at least 1, got ${decodedScale}`);
  }
  const baseWidth = Math.ceil(sourceWidth / decodedScale);
  const baseHeight = Math.ceil(sourceHeight / decodedScale);
  const levels: PyramidLevel[] = [];
  for (let index = 0; ; index++) {
    const factor = 2 ** index;
    const width = Math.ceil(baseWidth / factor);
    const height = Math.ceil(baseHeight / factor);
    levels.push({
      index,
      width,
      height,
      cols: Math.ceil(width / TILE_CONTENT),
      rows: Math.ceil(height / TILE_CONTENT),
      scale: factor * decodedScale,
      scaleX: sourceWidth / width,
      scaleY: sourceHeight / height,
    });
    if (Math.max(width, height) <= TILE_CONTENT) break;
  }
  const overview = levels.findIndex(level => Math.max(level.width, level.height) <= OVERVIEW_MAX_SIDE);
  return { width: sourceWidth, height: sourceHeight, levels, overview };
}

/** The level a tile belongs to; throws for a tile outside the pyramid. */
export function levelOf(p: Pyramid, t: TileRef): PyramidLevel {
  const level = p.levels[t.level];
  if (!level || !Number.isInteger(t.col) || !Number.isInteger(t.row)
    || t.col < 0 || t.row < 0 || t.col >= level.cols || t.row >= level.rows) {
    throw new RangeError(`Tile ${tileKey(t)} is outside the pyramid`);
  }
  return level;
}

/** The tile's content in level pixels, without overlap. Content rects tile their level exactly. */
export function tileContentRect(p: Pyramid, t: TileRef): PixelRect {
  const level = levelOf(p, t);
  const x = t.col * TILE_CONTENT;
  const y = t.row * TILE_CONTENT;
  return {
    x,
    y,
    width: Math.min(TILE_CONTENT, level.width - x),
    height: Math.min(TILE_CONTENT, level.height - y),
  };
}

/** What a tile's bitmap is cut from, in level pixels: its content plus the overlap, clamped to the level. */
export function tileSourceRect(p: Pyramid, t: TileRef): PixelRect {
  const level = levelOf(p, t);
  const content = tileContentRect(p, t);
  const x = Math.max(0, content.x - TILE_OVERLAP);
  const y = Math.max(0, content.y - TILE_OVERLAP);
  const right = Math.min(level.width, content.x + content.width + TILE_OVERLAP);
  const bottom = Math.min(level.height, content.y + content.height + TILE_OVERLAP);
  return { x, y, width: right - x, height: bottom - y };
}

/** Where the content lies within the tile's bitmap: the texture frame to draw. */
export function tileContentFrame(p: Pyramid, t: TileRef): PixelRect {
  const content = tileContentRect(p, t);
  const source = tileSourceRect(p, t);
  return { x: content.x - source.x, y: content.y - source.y, width: content.width, height: content.height };
}

/** The tile's content in world units; the tiles of every level cover the world exactly. */
export function tileWorldRect(p: Pyramid, t: TileRef): PixelRect {
  const { scaleX, scaleY } = levelOf(p, t);
  const content = tileContentRect(p, t);
  return {
    x: content.x * scaleX,
    y: content.y * scaleY,
    width: content.width * scaleX,
    height: content.height * scaleY,
  };
}

/** A tile's identity within its pyramid, "level/col/row" (the tile store's spelling). */
export function tileKey(t: TileRef): string {
  return `${t.level}/${t.col}/${t.row}`;
}

/** The tile one level coarser that holds this one, or null on the last level. */
export function parentTile(p: Pyramid, t: TileRef): TileRef | null {
  if (t.level + 1 >= p.levels.length) return null;
  return { level: t.level + 1, col: Math.floor(t.col / 2), row: Math.floor(t.row / 2) };
}

/** The tiles one level finer that this one holds (one to four; none on level 0). */
export function childTiles(p: Pyramid, t: TileRef): TileRef[] {
  const finer = p.levels[t.level - 1];
  if (!finer) return [];
  const children: TileRef[] = [];
  for (let row = t.row * 2; row < Math.min(t.row * 2 + 2, finer.rows); row++) {
    for (let col = t.col * 2; col < Math.min(t.col * 2 + 2, finer.cols); col++) {
      children.push({ level: t.level - 1, col, row });
    }
  }
  return children;
}
