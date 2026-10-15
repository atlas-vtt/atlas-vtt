import { MAX_SCENE_ID } from './moves.ts';
import { MAX_PLAYERS, PLAYER_ID_PATTERN, playerName } from './relay.ts';
import { isRecord } from './shape.ts';
import { MAX_COORDINATE } from './tokens.ts';

/** The most trail numbers (x, y pairs) a player's laser message carries. */
export const MAX_LASER_NUMBERS = 32;
/** The most trail numbers one laser carries in a `marks` message. */
export const MAX_MARK_LASER_NUMBERS = 64;
/** The most numbers (x, y pairs) of places a player's cursor message carries. */
export const MAX_CURSOR_NUMBERS = 32;
/** A cursor that has not moved for this long is at rest: the GM sends it to nobody until it moves again. */
export const CURSOR_REST_MS = 5000;
/** The GM names every cursor it shows at least this often, also when nothing changed, so pages can tell a silent GM. */
export const CURSOR_KEEPALIVE_MS = 2000;
/** The most numbers of places one cursor carries in a `marks` message. */
export const MAX_MARK_CURSOR_NUMBERS = 64;
/** The most measurements a player keeps on the map. */
export const MAX_KEPT = 20;
/** The most kept measurements one sender has in a `marks` message (the GM keeps more than a player). */
export const MAX_MARK_KEPT = 50;
/**
 * The shortest time between two `marks` messages, and between two of a player's lasers, measurements
 * or cursors: 10 a second (the last change always goes out). Each message carries the places passed
 * since the one before and the time they took, so a receiver still moves a pointer on every frame
 * (`PointerTrack`). Older pages and GMs send every 33 ms.
 */
export const MARKS_INTERVAL_MS = 100;
/** The longest span a laser or a measurement message tells, in ms. */
export const MAX_LASER_SPAN_MS = 1000;
/** Who a mark is from: a player's relay id, or the GM. */
export const GM_MARKS = 'gm';

export type MarkPoint = readonly [number, number];
export type MarkShape = 'line' | 'circle' | 'cone';

/** A measurement: its shape, where it starts (`a`) and where it was dragged to (`b`), in world pixels. */
export interface SharedMeasure {
  readonly shape: MarkShape;
  readonly a: MarkPoint;
  readonly b: MarkPoint;
}

/**
 * A laser as it is now: the pointer (null while off the map or not pointing), the trail points added
 * since the last message (x, y flat), and whether it draws. `span` is the time in whole milliseconds
 * from the pointer's place the sender's last message ended on to the one this message ends on, so a
 * receiver can draw the points when they were made; a sender that tells none is drawn as it arrives.
 */
export interface LaserState {
  readonly color: string;
  readonly size: number;
  readonly at: MarkPoint | null;
  readonly pts: readonly number[];
  readonly on: boolean;
  readonly span?: number;
}

/**
 * A player's measurements as they are now: the one being drawn and the kept ones. `span` is the time
 * in whole milliseconds from the end of `live` the sender's last message told to the one this message
 * tells, so a receiver can move the end as it was dragged; a sender that tells none is drawn as it arrives.
 */
export interface MeasureState {
  readonly color: string;
  readonly live: SharedMeasure | null;
  readonly kept: readonly SharedMeasure[];
  readonly span?: number;
}

/**
 * A cursor as it is now: the pointer (null once it left the map), the places it passed since the
 * sender's last message (x, y flat, oldest first) and the time they cover (`span`, as a laser's).
 */
export interface CursorState {
  readonly at: MarkPoint | null;
  readonly pts: readonly number[];
  readonly span?: number;
}

/** A player's cursor in the shared scene, sent only while the GM lets everyone see cursors (`SharedRules.cursors`). */
export type PlayerCursor = { readonly t: 'cursor'; readonly scene: string } & CursorState;

/** One cursor the GM sends on: whose it is (`GM_MARKS` or a player's id) and, a player's, the name they go by at the table. */
export type SharedCursor = { readonly who: string; readonly name?: string } & CursorState;


/** A player's laser in the shared scene. */
export type PlayerLaser = { readonly t: 'laser'; readonly scene: string } & LaserState;
/** A player's measurements in the shared scene, whole each time. */
export type PlayerMeasure = { readonly t: 'measure'; readonly scene: string } & MeasureState;

/**
 * Everyone's marks in the scene `scene` but those players may not see: each laser and each sender's
 * measurements, by who made them (`GM_MARKS` or a player's id). A sender missing from it has none.
 * `cursors` is there only while the GM lets everyone see cursors; a sender missing from it shows
 * none (off the map, at rest for long, pointing with the laser). They ride in this message, not in
 * one of their own, so everything that moves goes out in one frame per interval.
 */
export interface MarksMessage {
  readonly t: 'marks';
  readonly scene: string;
  readonly lasers: readonly ({ readonly who: string } & LaserState)[];
  readonly measures: readonly ({ readonly who: string } & MeasureState)[];
  readonly cursors?: readonly SharedCursor[];
}

const SHAPES: readonly string[] = ['line', 'circle', 'cone'];
const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_LASER_SIZE = 1000;

const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const isSceneId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_SCENE_ID;
const isSpan = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LASER_SPAN_MS;
const isWho = (value: unknown): value is string => value === GM_MARKS || (typeof value === 'string' && PLAYER_ID_PATTERN.test(value));

function parsePoint(value: unknown): MarkPoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value as unknown[];
  return isCoordinate(x) && isCoordinate(y) ? [x, y] : null;
}

function parseMeasure(value: unknown): SharedMeasure | null {
  if (!isRecord(value) || typeof value.shape !== 'string' || !SHAPES.includes(value.shape)) return null;
  const a = parsePoint(value.a);
  const b = parsePoint(value.b);
  return a === null || b === null ? null : { shape: value.shape as MarkShape, a, b };
}

function parseLaserState(value: Record<string, unknown>, maxNumbers: number): LaserState | null {
  const { color, size, at, pts, on, span } = value;
  if (typeof color !== 'string' || !COLOR.test(color) || typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > MAX_LASER_SIZE) return null;
  if (typeof on !== 'boolean' || !Array.isArray(pts) || pts.length > maxNumbers || pts.length % 2 !== 0 || !pts.every(isCoordinate)) return null;
  if (span !== undefined && !isSpan(span)) return null;
  const point = at === null ? null : parsePoint(at);
  if (at !== null && point === null) return null;
  return { color, size, at: point, pts, on, ...(span !== undefined && { span }) };
}

function parseCursorState(value: Record<string, unknown>, maxNumbers: number): CursorState | null {
  const { at, pts, span } = value;
  if (!Array.isArray(pts) || pts.length > maxNumbers || pts.length % 2 !== 0 || !pts.every(isCoordinate)) return null;
  if (span !== undefined && !isSpan(span)) return null;
  const point = at === null ? null : parsePoint(at);
  if (at !== null && point === null) return null;
  return { at: point, pts, ...(span !== undefined && { span }) };
}

/** Every item read, or null when any was malformed. */
function readAll<T>(values: readonly unknown[], read: (value: unknown) => T | null): T[] | null {
  const items: T[] = [];
  for (const value of values) {
    const item = read(value);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

function parseMeasureState(value: Record<string, unknown>, maxKept: number): MeasureState | null {
  const { color, live, kept, span } = value;
  if (typeof color !== 'string' || !COLOR.test(color) || !Array.isArray(kept) || kept.length > maxKept) return null;
  if (span !== undefined && !isSpan(span)) return null;
  const measure = live === null ? null : parseMeasure(live);
  const records = readAll(kept, parseMeasure);
  return (live !== null && measure === null) || records === null ? null : { color, live: measure, kept: records, ...(span !== undefined && { span }) };
}

/** A player's laser, measurements or cursor as the GM reads them, or null for anything malformed. */
export function parsePlayerMark(value: Record<string, unknown>): PlayerLaser | PlayerMeasure | PlayerCursor | null {
  if (!isSceneId(value.scene)) return null;
  if (value.t === 'cursor') {
    const cursor = parseCursorState(value, MAX_CURSOR_NUMBERS);
    return cursor === null ? null : { t: 'cursor', scene: value.scene, ...cursor };
  }
  if (value.t === 'laser') {
    const laser = parseLaserState(value, MAX_LASER_NUMBERS);
    return laser === null ? null : { t: 'laser', scene: value.scene, ...laser };
  }
  if (value.t !== 'measure') return null;
  const measure = parseMeasureState(value, MAX_KEPT);
  return measure === null ? null : { t: 'measure', scene: value.scene, ...measure };
}

/** A `marks` entry's sender and fields, or null when it names nobody. */
function entryOf(value: unknown): { readonly who: string; readonly fields: Record<string, unknown> } | null {
  return isRecord(value) && isWho(value.who) ? { who: value.who, fields: value } : null;
}

/** A `marks` message as the client reads it, or null for anything malformed. */
export function parseMarks(value: Record<string, unknown>): MarksMessage | null {
  const { scene, lasers, measures, cursors } = value;
  const max = MAX_PLAYERS + 1;
  if (!isSceneId(scene) || !Array.isArray(lasers) || !Array.isArray(measures) || lasers.length > max || measures.length > max) return null;
  const lasersRead = readAll(lasers, (value) => {
    const entry = entryOf(value);
    const laser = entry === null ? null : parseLaserState(entry.fields, MAX_MARK_LASER_NUMBERS);
    return entry === null || laser === null ? null : { who: entry.who, ...laser };
  });
  const measuresRead = readAll(measures, (value) => {
    const entry = entryOf(value);
    const state = entry === null ? null : parseMeasureState(entry.fields, MAX_MARK_KEPT);
    return entry === null || state === null ? null : { who: entry.who, ...state };
  });
  const cursorsRead = cursors === undefined ? undefined : parseCursorList(cursors);
  if (lasersRead === null || measuresRead === null || cursorsRead === null) return null;
  return { t: 'marks', scene, lasers: lasersRead, measures: measuresRead, ...(cursorsRead !== undefined && { cursors: cursorsRead }) };
}

/** The cursors of a `marks` message, or null when any is malformed. */
function parseCursorList(cursors: unknown): SharedCursor[] | null {
  if (!Array.isArray(cursors) || cursors.length > MAX_PLAYERS + 1) return null;
  return readAll(cursors, (value): SharedCursor | null => {
    const entry = entryOf(value);
    const cursor = entry === null ? null : parseCursorState(entry.fields, MAX_MARK_CURSOR_NUMBERS);
    if (entry === null || cursor === null) return null;
    const { name } = entry.fields;
    if (name === undefined) return { who: entry.who, ...cursor };
    // A name is shown as text: only one that is already as the relay would show it.
    return typeof name === 'string' && playerName(name) === name ? { who: entry.who, name, ...cursor } : null;
  });
}
