/** Which loaded tesserae to draw while finer ones load: fallbacks, retention and coverage. Pure: no PIXI, no DOM. */
import { childTesserae, parentTessera, tesseraKey, tesseraWorldRect, type PixelRect, type Pyramid, type TesseraRef } from './pyramid';

/** A missing or fading tessera falls back on loaded tesserae up to this many levels coarser (Leaflet `_retainParent`)… */
export const RETAIN_ANCESTOR_LEVELS = 5;
/** …and up to this many levels finer (Leaflet `_retainChildren`). */
export const RETAIN_DESCENDANT_LEVELS = 2;

/** Membership by `tesseraKey`; a `Set<string>` fits. */
export interface TesseraKeySet {
  has(key: string): boolean;
}

export interface TesseraCoverage {
  /** Loaded tesserae to draw, coarsest first so finer tesserae lie on top. */
  draw: TesseraRef[];
  /** Loaded ancestors kept as fallbacks but fully covered by opaque finer drawn tesserae: keep, do not draw. */
  hidden: TesseraRef[];
  /** `draw` and `hidden` together: every loaded tessera the layer keeps. Any other loaded tessera may be released. */
  retain: TesseraRef[];
  /** Wanted tesserae that are not loaded yet, in the order they were wanted (pass them in priority order). */
  missing: TesseraRef[];
}

/**
 * Decides what a tiled layer shows of one view. `wanted` are the view's tesserae (as a pure function it
 * takes tesserae of several levels too); `loaded` holds the tesserae with a texture, `opaque` those drawn at full
 * alpha (fade finished; a subset of `loaded`).
 *
 * A wanted tessera that is loaded is always drawn. One that is missing or still fading keeps its loaded
 * ancestors up to the first opaque one, at most `RETAIN_ANCESTOR_LEVELS` up, and its loaded descendants
 * down to opaque ones, at most `RETAIN_DESCENDANT_LEVELS` down; once it is opaque, neither is kept
 * (Leaflet `_retainParent` / `_retainChildren`), so zooming out never leaves finer tesserae drawn shrunk.
 * A kept ancestor whose whole area is covered by opaque finer kept tesserae is hidden (OpenSeadragon's
 * coverage rule): only the fade decides, never the image's own alpha, so a map with transparent parts
 * never shows a coarse level through them once its finer tesserae are in. Wanted tesserae are never hidden.
 */
export function tesseraCoverage(
  pyramid: Pyramid,
  wanted: Iterable<TesseraRef>,
  loaded: TesseraKeySet,
  opaque: TesseraKeySet,
): TesseraCoverage {
  const kept = new Map<string, TesseraRef>();
  const wantedKeys = new Set<string>();
  const missing: TesseraRef[] = [];
  const isOpaque = (key: string): boolean => loaded.has(key) && opaque.has(key);

  const keepDescendants = (tessera: TesseraRef, depth: number): void => {
    for (const child of childTesserae(pyramid, tessera)) {
      const key = tesseraKey(child);
      if (loaded.has(key)) kept.set(key, child);
      if (!isOpaque(key) && depth > 1) keepDescendants(child, depth - 1);
    }
  };

  for (const tessera of wanted) {
    const key = tesseraKey(tessera);
    if (wantedKeys.has(key)) continue;
    wantedKeys.add(key);
    if (loaded.has(key)) kept.set(key, tessera);
    else missing.push(tessera);
    if (isOpaque(key)) continue;

    let ancestor = parentTessera(pyramid, tessera);
    for (let step = 0; ancestor && step < RETAIN_ANCESTOR_LEVELS; step++) {
      const ancestorKey = tesseraKey(ancestor);
      if (loaded.has(ancestorKey)) {
        kept.set(ancestorKey, ancestor);
        if (opaque.has(ancestorKey)) break;
      }
      ancestor = parentTessera(pyramid, ancestor);
    }
    keepDescendants(tessera, RETAIN_DESCENDANT_LEVELS);
  }

  const opaqueKept = [...kept].filter(([key]) => isOpaque(key)).map(([, tessera]) => tessera);
  const covered = coveredByFiner(pyramid, opaqueKept);
  const draw: TesseraRef[] = [];
  const hidden: TesseraRef[] = [];
  for (const [key, tessera] of kept) (!wantedKeys.has(key) && covered(tessera) ? hidden : draw).push(tessera);
  draw.sort(coarseFirst);
  hidden.sort(coarseFirst);
  return { draw, hidden, retain: [...draw, ...hidden], missing };
}

/**
 * Whether every point of `rect` that `tesserae` cover is covered by `done` tesserae of the same level or
 * finer: what a view at their level needs before it is drawn in full detail. A tessera counts as covered
 * when it is done itself, or when each of its children that reaches into `rect` is covered.
 */
export function coversView(pyramid: Pyramid, tesserae: Iterable<TesseraRef>, done: readonly TesseraRef[], rect: PixelRect): boolean {
  const covered = coveredByFiner(pyramid, done, rect);
  const doneKeys = new Set(done.map(tesseraKey));
  for (const tessera of tesserae) if (!doneKeys.has(tesseraKey(tessera)) && !covered(tessera)) return false;
  return true;
}

/**
 * Whether a tessera's area (within `rect`, when given) is covered by `cover` tesserae of finer levels: each
 * of its children is one of them or covered in turn.
 */
function coveredByFiner(pyramid: Pyramid, cover: Iterable<TesseraRef>, rect?: PixelRect): (tessera: TesseraRef) => boolean {
  const covers = new Set<string>();
  // Only a tessera with a covering tessera somewhere below it can be covered; this keeps the search off
  // subtrees that hold nothing.
  const holdsCover = new Set<string>();
  for (const tessera of cover) {
    covers.add(tesseraKey(tessera));
    for (let up = parentTessera(pyramid, tessera); up; up = parentTessera(pyramid, up)) {
      const upKey = tesseraKey(up);
      if (holdsCover.has(upKey)) break;
      holdsCover.add(upKey);
    }
  }
  const memo = new Map<string, boolean>();
  const covered = (tessera: TesseraRef): boolean => {
    const key = tesseraKey(tessera);
    if (!holdsCover.has(key)) return false;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const result = childTesserae(pyramid, tessera).every(child =>
      (rect && !overlaps(tesseraWorldRect(pyramid, child), rect)) || covers.has(tesseraKey(child)) || covered(child));
    memo.set(key, result);
    return result;
  };
  return covered;
}

function overlaps(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function coarseFirst(a: TesseraRef, b: TesseraRef): number {
  return b.level - a.level || a.row - b.row || a.col - b.col;
}
