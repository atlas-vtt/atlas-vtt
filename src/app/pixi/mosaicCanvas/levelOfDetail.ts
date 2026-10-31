/** Which pyramid level and tesserae a view needs, and in what order to load them. Pure: no PIXI, no DOM. */
import { TESSERA_CONTENT, tesseraWorldRect, type PixelRect, type Pyramid, type TesseraRef } from './pyramid';

/** A level's texels must cover at least this many screen pixels, so no level is minified more than 2×. */
export const MIN_TEXEL_SCREEN_PX = 0.5;

/** Keeps float noise (zoom × resolution landing a hair above a power of two) from picking a finer level. */
const LEVEL_EPSILON = 1e-9;

/** A camera, the GM's or a demand region's: what it shows and how many world units one screen pixel spans. */
export interface TesseraView {
  rect: PixelRect;
  worldPerScreenPixel: number;
}

/**
 * The finest level whose texels cover at least half a screen pixel:
 * `clamp(ceil(log2(0.5 × worldPerScreenPixel / decodedScale)), finest, last)`, where `finest` is the
 * finest level a source serves (`finestLevel`).
 */
export function levelFor(pyramid: Pyramid, worldPerScreenPixel: number, finest = 0): number {
  const last = pyramid.levels.length - 1;
  const floor = Math.min(last, Math.max(0, finest));
  // NaN and non-positive scales read as the finest level; Infinity reaches the last through the clamp.
  if (!(worldPerScreenPixel > 0)) return floor;
  const decodedScale = pyramid.levels[0]?.scale ?? 1;
  const level = Math.ceil(Math.log2((MIN_TEXEL_SCREEN_PX * worldPerScreenPixel) / decodedScale) - LEVEL_EPSILON);
  return Math.min(last, Math.max(floor, level));
}

/** The finest level whose longer side is at most `finestSide` (the last where none is); 0 without a side. */
export function finestLevel(pyramid: Pyramid, finestSide: number | undefined): number {
  if (finestSide === undefined) return 0;
  const index = pyramid.levels.findIndex((level) => Math.max(level.width, level.height) <= finestSide);
  return index === -1 ? pyramid.levels.length - 1 : index;
}

/**
 * The tesserae of `level` that `worldRect` touches, widened by `prefetch` tesserae on every side and clamped to
 * the level's grid; none when the rect lies outside the map or has no area. Row-major order.
 */
export function visibleTesserae(pyramid: Pyramid, level: number, worldRect: PixelRect, prefetch = 1): TesseraRef[] {
  const grid = pyramid.levels[level];
  if (!grid) return [];
  const { x, y, width, height } = worldRect;
  if (!(width > 0) || !(height > 0)) return [];
  if (x >= pyramid.width || y >= pyramid.height || x + width <= 0 || y + height <= 0) return [];
  const tesseraWorldX = TESSERA_CONTENT * grid.scaleX;
  const tesseraWorldY = TESSERA_CONTENT * grid.scaleY;
  const ring = Math.max(0, Math.floor(prefetch));
  const firstCol = Math.max(0, Math.floor(x / tesseraWorldX) - ring);
  const firstRow = Math.max(0, Math.floor(y / tesseraWorldY) - ring);
  const lastCol = Math.min(grid.cols - 1, Math.ceil((x + width) / tesseraWorldX) - 1 + ring);
  const lastRow = Math.min(grid.rows - 1, Math.ceil((y + height) / tesseraWorldY) - 1 + ring);
  const tesserae: TesseraRef[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) tesserae.push({ level, col, row });
  }
  return tesserae;
}

/**
 * A picture of `size` pixels framed on the centred crop of `rect` with the picture's aspect (a
 * thumbnail), rendered at no more than one pixel per world unit; null when `rect` has no area.
 */
export function pictureView(rect: PixelRect, size: { width: number; height: number }): TesseraView | null {
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

/** The tesserae a view wants: those of its level of detail it touches, plus the prefetch ring. */
export function tesseraeForView(pyramid: Pyramid, view: TesseraView, prefetch = 1): TesseraRef[] {
  return visibleTesserae(pyramid, levelFor(pyramid, view.worldPerScreenPixel), view.rect, prefetch);
}

/** How urgently a tessera is needed by a view; lower sorts first. */
export interface TesseraPriority {
  /** 0 on the view's level, then 1, 2… levels away, coarser before finer at the same distance. */
  levelRank: number;
  /** World distance from the tessera's centre to the view's centre. */
  distance: number;
}

/** A tessera's priority for one view: its level of detail first, then nearness to the view's centre. */
export function tesseraPriority(pyramid: Pyramid, tessera: TesseraRef, view: TesseraView): TesseraPriority {
  const target = levelFor(pyramid, view.worldPerScreenPixel);
  const steps = Math.abs(tessera.level - target);
  const levelRank = steps === 0 ? 0 : steps * 2 - (tessera.level > target ? 1 : 0);
  const rect = tesseraWorldRect(pyramid, tessera);
  const dx = rect.x + rect.width / 2 - (view.rect.x + view.rect.width / 2);
  const dy = rect.y + rect.height / 2 - (view.rect.y + view.rect.height / 2);
  return { levelRank, distance: Math.hypot(dx, dy) };
}

export function compareTesseraPriority(a: TesseraPriority, b: TesseraPriority): number {
  return a.levelRank - b.levelRank || a.distance - b.distance;
}

/**
 * `tesserae` in load order for every view at once: each tessera ranks by the view that needs it most. Ties keep
 * the input order, so a caller's order (e.g. row-major) breaks them deterministically.
 */
export function orderByPriority(pyramid: Pyramid, tesserae: readonly TesseraRef[], views: readonly TesseraView[]): TesseraRef[] {
  const [first, ...others] = views;
  if (!first) return [...tesserae];
  const ranked = tesserae.map((tessera, index) => {
    let best = tesseraPriority(pyramid, tessera, first);
    for (const view of others) {
      const other = tesseraPriority(pyramid, tessera, view);
      if (compareTesseraPriority(other, best) < 0) best = other;
    }
    return { tessera, index, priority: best };
  });
  ranked.sort((a, b) => compareTesseraPriority(a.priority, b.priority) || a.index - b.index);
  return ranked.map(entry => entry.tessera);
}
