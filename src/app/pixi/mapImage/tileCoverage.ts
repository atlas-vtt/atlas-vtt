/** Which loaded tiles to draw while finer ones load: fallbacks, retention and coverage. Pure: no PIXI, no DOM. */
import { childTiles, parentTile, tileKey, tileWorldRect, type PixelRect, type Pyramid, type TileRef } from './pyramid';

/** A missing or fading tile falls back on loaded tiles up to this many levels coarser (Leaflet `_retainParent`)… */
export const RETAIN_ANCESTOR_LEVELS = 5;
/** …and up to this many levels finer (Leaflet `_retainChildren`). */
export const RETAIN_DESCENDANT_LEVELS = 2;

/** Membership by `tileKey`; a `Set<string>` fits. */
export interface TileKeySet {
  has(key: string): boolean;
}

export interface TileCoverage {
  /** Loaded tiles to draw, coarsest first so finer tiles lie on top. */
  draw: TileRef[];
  /** Loaded ancestors kept as fallbacks but fully covered by opaque finer drawn tiles: keep, do not draw. */
  hidden: TileRef[];
  /** `draw` and `hidden` together: every loaded tile the layer keeps. Any other loaded tile may be released. */
  retain: TileRef[];
  /** Wanted tiles that are not loaded yet, in the order they were wanted (pass them in priority order). */
  missing: TileRef[];
}

/**
 * Decides what a tiled layer shows of one view. `wanted` are the view's tiles (as a pure function it
 * takes tiles of several levels too); `loaded` holds the tiles with a texture, `opaque` those drawn at full
 * alpha (fade finished; a subset of `loaded`).
 *
 * A wanted tile that is loaded is always drawn. One that is missing or still fading keeps its loaded
 * ancestors up to the first opaque one, at most `RETAIN_ANCESTOR_LEVELS` up, and its loaded descendants
 * down to opaque ones, at most `RETAIN_DESCENDANT_LEVELS` down; once it is opaque, neither is kept
 * (Leaflet `_retainParent` / `_retainChildren`), so zooming out never leaves finer tiles drawn shrunk.
 * A kept ancestor whose whole area is covered by opaque finer kept tiles is hidden (OpenSeadragon's
 * coverage rule): only the fade decides, never the image's own alpha, so a map with transparent parts
 * never shows a coarse level through them once its finer tiles are in. Wanted tiles are never hidden.
 */
export function tileCoverage(
  pyramid: Pyramid,
  wanted: Iterable<TileRef>,
  loaded: TileKeySet,
  opaque: TileKeySet,
): TileCoverage {
  const kept = new Map<string, TileRef>();
  const wantedKeys = new Set<string>();
  const missing: TileRef[] = [];
  const isOpaque = (key: string): boolean => loaded.has(key) && opaque.has(key);

  const keepDescendants = (tile: TileRef, depth: number): void => {
    for (const child of childTiles(pyramid, tile)) {
      const key = tileKey(child);
      if (loaded.has(key)) kept.set(key, child);
      if (!isOpaque(key) && depth > 1) keepDescendants(child, depth - 1);
    }
  };

  for (const tile of wanted) {
    const key = tileKey(tile);
    if (wantedKeys.has(key)) continue;
    wantedKeys.add(key);
    if (loaded.has(key)) kept.set(key, tile);
    else missing.push(tile);
    if (isOpaque(key)) continue;

    let ancestor = parentTile(pyramid, tile);
    for (let step = 0; ancestor && step < RETAIN_ANCESTOR_LEVELS; step++) {
      const ancestorKey = tileKey(ancestor);
      if (loaded.has(ancestorKey)) {
        kept.set(ancestorKey, ancestor);
        if (opaque.has(ancestorKey)) break;
      }
      ancestor = parentTile(pyramid, ancestor);
    }
    keepDescendants(tile, RETAIN_DESCENDANT_LEVELS);
  }

  const opaqueKept = [...kept].filter(([key]) => isOpaque(key)).map(([, tile]) => tile);
  const covered = coveredByFiner(pyramid, opaqueKept);
  const draw: TileRef[] = [];
  const hidden: TileRef[] = [];
  for (const [key, tile] of kept) (!wantedKeys.has(key) && covered(tile) ? hidden : draw).push(tile);
  draw.sort(coarseFirst);
  hidden.sort(coarseFirst);
  return { draw, hidden, retain: [...draw, ...hidden], missing };
}

/**
 * Whether every point of `rect` that `tiles` cover is covered by `done` tiles of the same level or
 * finer: what a view at their level needs before it is drawn in full detail. A tile counts as covered
 * when it is done itself, or when each of its children that reaches into `rect` is covered.
 */
export function coversView(pyramid: Pyramid, tiles: Iterable<TileRef>, done: readonly TileRef[], rect: PixelRect): boolean {
  const covered = coveredByFiner(pyramid, done, rect);
  const doneKeys = new Set(done.map(tileKey));
  for (const tile of tiles) if (!doneKeys.has(tileKey(tile)) && !covered(tile)) return false;
  return true;
}

/**
 * Whether a tile's area (within `rect`, when given) is covered by `cover` tiles of finer levels: each
 * of its children is one of them or covered in turn.
 */
function coveredByFiner(pyramid: Pyramid, cover: Iterable<TileRef>, rect?: PixelRect): (tile: TileRef) => boolean {
  const covers = new Set<string>();
  // Only a tile with a covering tile somewhere below it can be covered; this keeps the search off
  // subtrees that hold nothing.
  const holdsCover = new Set<string>();
  for (const tile of cover) {
    covers.add(tileKey(tile));
    for (let up = parentTile(pyramid, tile); up; up = parentTile(pyramid, up)) {
      const upKey = tileKey(up);
      if (holdsCover.has(upKey)) break;
      holdsCover.add(upKey);
    }
  }
  const memo = new Map<string, boolean>();
  const covered = (tile: TileRef): boolean => {
    const key = tileKey(tile);
    if (!holdsCover.has(key)) return false;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const result = childTiles(pyramid, tile).every(child =>
      (rect && !overlaps(tileWorldRect(pyramid, child), rect)) || covers.has(tileKey(child)) || covered(child));
    memo.set(key, result);
    return result;
  };
  return covered;
}

function overlaps(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function coarseFirst(a: TileRef, b: TileRef): number {
  return b.level - a.level || a.row - b.row || a.col - b.col;
}
