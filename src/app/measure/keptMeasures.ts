/**
 * Kept measurements (`KeptMeasure`) as everything reads them. A map file arrives unchecked (a hand
 * edit, a sync conflict, a newer Atlas) and the store keeps what it holds, so that the next save
 * writes it back: what cannot be read is passed over here, at reading, and nothing is removed.
 *
 * A measurement with nothing wrong is read as itself, and one that needed mending as the same view
 * every time, so whoever compares measurements finds unchanged ones unchanged.
 */

import { readEmission } from '../lighting/lightingObjects';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';
import { isHexColor } from '../utils/hexColor';
import { readMeasureEffect } from './measureEffects';
import { MAX_AURA, MAX_MEASURES, MAX_MEASURE_AUTHOR, MAX_ORIGIN_TOKENS, MAX_RULER_POINTS, MEASURE_SHAPES, type KeptAura, type KeptMeasure, type KeptMeasureOrigin, type MeasureShapeKind } from './measureTypes';

const NONE: readonly KeptMeasure[] = [];
const lists = new WeakMap<object, readonly KeptMeasure[]>();
const views = new WeakMap<object, { id: string; measure: KeptMeasure | null }>();

/** What an origin that cannot be read counts as: players never see the measurement, since nothing says they may. */
const UNREADABLE_ORIGIN: KeptMeasureOrigin = Object.freeze({ tokenIds: [], unseenAtStart: true });

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

const isShape = (value: unknown): value is MeasureShapeKind => MEASURE_SHAPES.some((shape) => shape === value);

/** A ruler has its start and end at least; an area exactly its origin and its end. */
function isPath(value: unknown, shape: MeasureShapeKind): value is Point[] {
  if (!Array.isArray(value) || !value.every(isPoint)) return false;
  return shape === 'ruler' ? value.length >= 2 && value.length <= MAX_RULER_POINTS : value.length === 2;
}

const isWidth = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isAuthor = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_MEASURE_AUTHOR;

function isOrigin(value: unknown): value is KeptMeasureOrigin {
  if (!isRecord(value) || typeof value.unseenAtStart !== 'boolean') return false;
  const { tokenIds } = value;
  return Array.isArray(tokenIds) && tokenIds.length <= MAX_ORIGIN_TOKENS && tokenIds.every((id) => typeof id === 'string');
}

const isAuraReach = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_AURA;

/** Whether `measure` is an aura: a circle that names the token it follows and how far it reaches from it. */
export function isAura(measure: KeptMeasure): measure is KeptAura {
  return measure.shape === 'circle' && typeof measure.follows === 'string' && measure.follows !== '' && isAuraReach(measure.aura);
}

/**
 * The token the entry `value` of a measures record follows: the reader's own answer to whether it
 * is an aura, for whoever keeps auras with their tokens. Null for everything `readMeasure` does
 * not read as one: a ruler or another area that names a token, a circle without a reach, an entry
 * that is no measurement. Read anew at every call, so it may be asked of a store draft.
 */
export function followedToken(id: string, value: unknown): string | null {
  const measure = isRecord(value) ? measureOf(id, value) : null;
  return measure && isAura(measure) ? measure.follows : null;
}

function measureOf(id: string, value: Record<string, unknown>): KeptMeasure | null {
  const { shape, points } = value;
  if (!isShape(shape) || !isPath(points, shape)) return null;
  const { id: ownId, kind, width, color, hidden, by, origin, level, walls, follows, aura, light, effect, ...rest } = value;
  const emission = light === undefined ? null : readEmission(light);
  const look = readMeasureEffect(effect);
  // An aura is both of its fields on a circle; one alone, or on another shape, says nothing.
  const follower = shape === 'circle' && typeof follows === 'string' && follows !== '' && isAuraReach(aura);
  const sound = ownId === id && kind === 'measure'
    && (width === undefined || isWidth(width)) && (color === undefined || isHexColor(color)) && (hidden === undefined || hidden === true)
    && (by === undefined || isAuthor(by)) && (origin === undefined || isOrigin(origin)) && (level === undefined || typeof level === 'string')
    && (walls === undefined || walls === false) && (follower || (follows === undefined && aura === undefined))
    && (light === undefined || emission === light) && (effect === undefined || look !== undefined);
  if (sound) return value as unknown as KeptMeasure;
  // What this Atlas does not know (`rest`) stays on the view, for readers that do.
  return {
    ...rest,
    id,
    kind: 'measure',
    shape,
    points,
    ...(isWidth(width) && { width }),
    ...(isHexColor(color) && { color }),
    ...(hidden === true && { hidden }),
    ...(isAuthor(by) && { by }),
    ...(origin !== undefined && { origin: isOrigin(origin) ? origin : UNREADABLE_ORIGIN }),
    ...(typeof level === 'string' && { level }),
    ...(walls === false && { walls }),
    ...(follower && { follows, aura }),
    ...(emission && { light: emission }),
    ...(look && { effect: look }),
  };
}

/**
 * A kept measurement as it is read: `id` is its place in the record, which is how the store finds
 * it. None without a known shape and finite points that fit it (two for an area, two to
 * `MAX_RULER_POINTS` for a ruler). A colour that is not `#rrggbb`, a width that is no size and a
 * maker that is no name read as unset, `hidden` only where it is `true`, `walls` only where it is
 * `false`, an origin that cannot be read as one the players never saw, and `follows` with `aura`
 * only as a pair on a circle (`isAura`): a circle that names one of them alone stays where it is.
 * A `light` is read as every light's emission is (`readEmission`: none without its two ranges),
 * and an `effect` this Atlas does not know as none.
 */
export function readMeasure(id: string, value: unknown): KeptMeasure | null {
  if (!isRecord(value)) return null;
  const known = views.get(value);
  if (known?.id === id) return known.measure;
  const measure = measureOf(id, value);
  views.set(value, { id, measure });
  return measure;
}

/**
 * The kept measurements of a record in the order they were made, a later one lying over an earlier
 * one: the first `MAX_MEASURES` that are measurements. Hand it the measurements of one level
 * (`levelObjects`). The record itself stays as the file has it; the same list for the same record.
 */
export function measureList(measures: Record<string, KeptMeasure> | undefined): readonly KeptMeasure[] {
  if (!isRecord(measures)) return NONE;
  let list = lists.get(measures);
  if (!list) {
    const read: KeptMeasure[] = [];
    for (const [id, value] of Object.entries(measures)) {
      const measure = readMeasure(id, value);
      if (measure) read.push(measure);
      if (read.length === MAX_MEASURES) break;
    }
    list = read;
    lists.set(measures, list);
  }
  return list;
}

/** The kept measurements a map file holds, as the store keeps them: the file's record untouched, or none where it holds something else. */
export function measuresFromFile(value: unknown): Record<string, KeptMeasure> | undefined {
  return isRecord(value) ? (value as Record<string, KeptMeasure>) : undefined;
}

/**
 * A kept measurement as it lies once the map under it is drawn another way: every point follows
 * its place on the image, and a line's width stays, as sizes do. An entry that is no object, or
 * whose points cannot be read, stays as it is.
 */
export function measureMovedWithMap<T>(measure: T, move: (point: Point) => Point): T {
  if (!isRecord(measure)) return measure;
  const { points } = measure;
  if (!Array.isArray(points) || !points.every(isPoint)) return measure;
  return { ...measure, points: points.map(move) };
}
