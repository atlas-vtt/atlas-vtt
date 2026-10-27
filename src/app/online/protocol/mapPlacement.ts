import { isRecord } from './shape.ts';

/**
 * How the GM's Atlas draws a scene's map image so that its regular, level grid fits the cells printed
 * on it: turned level about its centre by `rotation` (degrees the image lies turned, clockwise on
 * screen), then stretched `x` and `y` times from the world's origin, the corner of the upright box
 * that holds the turned image. Tokens, walls, fog and the grid are places in that world.
 */
export interface SharedMapStretch {
  readonly x: number;
  readonly y: number;
  readonly rotation?: number;
}

/**
 * How a floor whose image the GM fitted to the scene's grid on its own (a fitted level) is placed:
 * its stretched box scaled `scale` times and begun at `offset` world pixels from the origin, which
 * the world still begins at. Atlas's `levelImagePlacement` folds it with the floor's stretch.
 */
export interface SharedLevelFit {
  readonly scale: number;
  readonly offset: { readonly x: number; readonly y: number };
}

/**
 * Where a scene's map image lies in its world, beside the map in the scene message. Both are absent
 * for a map drawn as it is, so such a scene goes out as it always did. Neither changes within a
 * scene: another placement is another scene (`SharedScene.id`), whose tokens, walls and fog lie in
 * its world. Added later: an older GM sends neither, and an older page draws the map unplaced.
 */
export interface SharedMapPlacement {
  /** The stretch of the scene's map, or of a fitted floor's own image where `fit` is given. */
  readonly stretch?: SharedMapStretch;
  /** A fitted floor's placement; absent for a floor drawn as the scene's map is. */
  readonly fit?: SharedLevelFit;
}

/** A map only ever grows along an axis, and by no more than half. */
export const MIN_MAP_STRETCH = 1;
export const MAX_MAP_STRETCH = 1.5;
/** A map turned further than this many degrees is no scan that lay askew. */
export const MAX_MAP_ROTATION = 5;
/** The scales a fitted floor's image is drawn at: anything else is no fit of a printed grid. */
export const MIN_FIT_SCALE = 0.05;
export const MAX_FIT_SCALE = 20;
/** How far into the world a fitted floor's image may begin, in world pixels. */
export const MAX_FIT_OFFSET = 1_000_000;

const isFactor = (value: unknown): value is number => typeof value === 'number' && value >= MIN_MAP_STRETCH && value <= MAX_MAP_STRETCH;
const isOffset = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= MAX_FIT_OFFSET;

/**
 * A map's stretch as a client reads it, held to what Atlas itself draws: null for a map drawn as it
 * is, which is also what anything missing, malformed or out of range reads as (never half of it: a
 * stretch whose angle is wrong is none at all).
 */
export function parseMapStretch(value: unknown): SharedMapStretch | null {
  if (!isRecord(value) || !isFactor(value.x) || !isFactor(value.y)) return null;
  const { x, y, rotation } = value;
  if (rotation === undefined || rotation === 0) return x === 1 && y === 1 ? null : { x, y };
  return typeof rotation === 'number' && Math.abs(rotation) <= MAX_MAP_ROTATION ? { x, y, rotation } : null;
}

/**
 * A fitted floor's placement as a client reads it, held to what Atlas reads from a scene file: null
 * for anything missing, malformed or out of range. A fit that changes nothing is still a fit: it
 * draws the floor's image by its own stretch, not by the scene's.
 */
export function parseLevelFit(value: unknown): SharedLevelFit | null {
  if (!isRecord(value) || !isRecord(value.offset)) return null;
  const { scale, offset } = value;
  if (typeof scale !== 'number' || !(scale >= MIN_FIT_SCALE && scale <= MAX_FIT_SCALE)) return null;
  return isOffset(offset.x) && isOffset(offset.y) ? { scale, offset: { x: offset.x, y: offset.y } } : null;
}

/** The placement fields of a scene with a map, each where it is given and well formed: a malformed one is left out, so the scene still shows. */
export function parseMapPlacement(value: Readonly<Record<string, unknown>>): SharedMapPlacement {
  const stretch = parseMapStretch(value.stretch);
  const fit = parseLevelFit(value.fit);
  return { ...(stretch !== null && { stretch }), ...(fit !== null && { fit }) };
}
