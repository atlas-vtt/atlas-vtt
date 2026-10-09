/** Which loaded tiles to draw while finer ones load: fallbacks, retention and coverage. Pure: no PIXI, no DOM. */
import { childTiles, parentTile, tileKey, type Pyramid, type TileRef } from './pyramid';

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
  /** Loaded tiles wanted or kept as fallbacks but fully covered by opaque finer drawn tiles: keep, do not draw. */
  hidden: TileRef[];
  /** `draw` and `hidden` together: every loaded tile the layer keeps. Any other loaded tile may be released. */
  retain: TileRef[];
  /** Wanted tiles that are not loaded yet, in the order they were wanted (pass them in priority order). */
  missing: TileRef[];
}

/**
 * Decides once per frame what a tiled layer shows. `wanted` is the union of every view's tiles (the GM
 * camera and each demand region, possibly at different levels); `loaded` holds the tiles with a texture,
 * `opaque` those drawn at full alpha (fade finished; a subset of `loaded`).
 *
 * A wanted tile that is loaded is drawn. One that is missing or still fading keeps its loaded ancestors up to
 * the first opaque one, at most `RETAIN_ANCESTOR_LEVELS` up, and its loaded descendants down to opaque ones,
 * at most `RETAIN_DESCENDANT_LEVELS` down. A kept tile whose whole area is covered by opaque finer drawn
 * tiles is hidden (OpenSeadragon's coverage rule): only the fade decides, never the image's own alpha, so a
 * map with transparent parts never shows a coarse level through them once its finer tiles are in.
 */
export function tileCoverage(
  pyramid: Pyramid,
  wanted: Iterable<TileRef>,
  loaded: TileKeySet,
  opaque: TileKeySet,
): TileCoverage {
  const kept = new Map<string, TileRef>();
  const missing: TileRef[] = [];
  const seen = new Set<string>();
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
    if (seen.has(key)) continue;
    seen.add(key);
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

  const covered = coverageOf(pyramid, kept, isOpaque);
  const draw: TileRef[] = [];
  const hidden: TileRef[] = [];
  for (const [key, tile] of kept) (covered(key, tile) ? hidden : draw).push(tile);
  draw.sort(coarseFirst);
  hidden.sort(coarseFirst);
  return { draw, hidden, retain: [...draw, ...hidden], missing };
}

/** Whether a tile's whole area is covered by opaque kept tiles of finer levels. */
function coverageOf(
  pyramid: Pyramid,
  kept: ReadonlyMap<string, TileRef>,
  isOpaque: (key: string) => boolean,
): (key: string, tile: TileRef) => boolean {
  const coversOwnArea = (key: string): boolean => kept.has(key) && isOpaque(key);
  // Only a tile with an opaque kept tile somewhere below it can be covered; this keeps the search off
  // subtrees that hold nothing.
  const holdsOpaque = new Set<string>();
  for (const [key, tile] of kept) {
    if (!coversOwnArea(key)) continue;
    for (let up = parentTile(pyramid, tile); up; up = parentTile(pyramid, up)) {
      const upKey = tileKey(up);
      if (holdsOpaque.has(upKey)) break;
      holdsOpaque.add(upKey);
    }
  }
  const memo = new Map<string, boolean>();
  const covered = (key: string, tile: TileRef): boolean => {
    if (!holdsOpaque.has(key)) return false;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const result = childTiles(pyramid, tile).every(child => {
      const childKey = tileKey(child);
      return coversOwnArea(childKey) || covered(childKey, child);
    });
    memo.set(key, result);
    return result;
  };
  return covered;
}

function coarseFirst(a: TileRef, b: TileRef): number {
  return b.level - a.level || a.row - b.row || a.col - b.col;
}
