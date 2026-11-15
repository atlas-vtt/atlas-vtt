import { parseDrawing, type SharedDrawing } from './annotations.ts';
import { MAX_SCENE_ID } from './moves.ts';
import { MAX_PLAYERS, PLAYER_ID_PATTERN, playerName } from './relay.ts';
import { isRecord } from './shape.ts';
import { MAX_COORDINATE, TOKEN_ID_PATTERN } from './tokens.ts';

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
/** The most numbers (x, y pairs) a ruler's points take when it is told in full: its start, its corners and its end, 64 points. */
export const MAX_RULER_NUMBERS = 128;
/** The farthest an aura reaches from the edge of its token's space, in game units. */
export const MAX_AURA_REACH = 100_000;
/** The most numbers (x, y pairs, a fill's holes with them) the drawings of one stroke under way carry in a `marks` message. */
export const MAX_STROKE_NUMBERS = 2_048;
/** The most drawings a stroke under way is told as: one, or the areas of the cells being filled. */
export const MAX_STROKE_DRAWINGS = 16;
/** The most points a pen's stroke may have come to before the ones a message tells. */
export const MAX_STROKE_FROM = 10_000_000;
/** The highest number a sender counts its drawings to. */
export const MAX_STROKE_COUNT = 1_000_000_000;
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

/** What a measurement told in full is: a ruler is a path with corners, the others are areas. */
export type FullShape = 'ruler' | 'circle' | 'cone' | 'square' | 'line';

/** The looks the body of an area the GM keeps may be drawn with, in the area's colour. */
export const MARK_EFFECTS = ['fire', 'frost', 'lightning', 'mist', 'radiance', 'shadow'] as const;
export type MarkEffect = (typeof MARK_EFFECTS)[number];

/**
 * An aura: a circle that lies around a token wherever that token stands. `token` is the id players
 * know the token by (`SharedToken.id`), `reach` how far the aura reaches from the edge of the
 * token's space, in game units.
 */
export interface MarkAura {
  readonly token: string;
  readonly reach: number;
}

/**
 * A measurement in full. `pts` are its points flat (x, y pairs, world pixels): a ruler's start,
 * corners and end, two points at least; an area's origin and the end it was dragged to, two points
 * exactly. `width` is a line's, in world pixels; a line that tells none is one cell wide. `free` is
 * set on an area that walls do not stop: any other area is cut by the walls its reader knows of.
 *
 * What only the GM's measurements have (added later; a reader that does not know one of them does
 * not look at it, and the GM takes none of them from a player): `color` is the measurement's own
 * colour, `#rrggbb`, where it is not its sender's (`MeasureState.color`). `effect` is the look an
 * area's body is drawn with. `aura` is on a circle that follows a token: its reader draws it
 * around that token where the token is drawn, as far as `reach` says, and not at all while it
 * knows no such token; its `pts` are where it lay when it was last edited, and only say which way
 * it faces.
 */
export interface FullMeasure {
  readonly shape: FullShape;
  readonly pts: readonly number[];
  readonly width?: number;
  readonly free?: true;
  readonly color?: string;
  readonly effect?: MarkEffect;
  readonly aura?: MarkAura;
}

/** A sender's measurements in full: the one being drawn and the kept ones. */
export interface FullMeasures {
  readonly live: FullMeasure | null;
  readonly kept: readonly FullMeasure[];
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
 *
 * `live` and `kept` say what every reader can draw: a line, a circle or a cone between two points.
 * `full` says the same measurements in full (added later: an older sender tells none, and an older
 * reader does not look at it): a ruler with its corners, a square, a line with its width. A reader
 * that knows `full` draws it in place of `live` and `kept`, and `span` then times the last point of
 * `full.live`.
 */
export interface MeasureState {
  readonly color: string;
  readonly live: SharedMeasure | null;
  readonly kept: readonly SharedMeasure[];
  readonly span?: number;
  readonly full?: FullMeasures;
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


/**
 * A drawing under way, as it stands: `drawings` tells it as a finished drawing is told
 * (`SharedDrawing`, never a stamp), whole each time: the line, rectangle or ellipse being pulled,
 * or the areas of the cells being filled. `n` counts its sender's drawings: another number is
 * another drawing.
 *
 * A pen's stroke only grows at its end, so it tells the points it has come to since an earlier
 * message: `from` is how many points of the stroke lie before the first of `drawings[0].points`
 * (a reader that holds more of the stroke than that leaves out the ones it has, and one that holds
 * fewer joins the two with a straight piece), and `span` the time in whole milliseconds from the
 * last point the sender's message before told to the last of this one, so a reader can let the
 * stroke grow as it was drawn.
 *
 * `kept` says the drawing was made: it is told among the scene's drawings from now on, and its
 * reader shows what it has of it until those arrive. A sender whose stroke was dropped names it no more.
 */
export interface StrokeState {
  readonly n: number;
  readonly drawings: readonly SharedDrawing[];
  readonly from?: number;
  readonly span?: number;
  readonly kept?: true;
}

/** One sender's drawing under way, as the GM sends it on. */
export type SharedStroke = { readonly who: string } & StrokeState;

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
  /**
   * The drawings under way that players see grow (added later: a reader that does not know it shows
   * a drawing once it is made). A sender missing from it draws nothing.
   */
  readonly strokes?: readonly SharedStroke[];
}

const SHAPES: readonly string[] = ['line', 'circle', 'cone'];
const FULL_SHAPES: readonly string[] = ['ruler', 'circle', 'cone', 'square', 'line'];
const COLOR = /^#[0-9a-f]{6}$/i;
/** What an effect's name looks like, also one a later GM knows and this reader does not. */
const EFFECT_NAME = /^[a-z][a-z-]{0,31}$/;
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

/** An aura, or null for anything malformed: a token id that is none, a reach that is no distance within `MAX_AURA_REACH`. */
function parseAura(value: unknown): MarkAura | null {
  if (!isRecord(value) || typeof value.token !== 'string' || !TOKEN_ID_PATTERN.test(value.token)) return null;
  const { reach } = value;
  return typeof reach === 'number' && Number.isFinite(reach) && reach > 0 && reach <= MAX_AURA_REACH ? { token: value.token, reach } : null;
}

/**
 * A measurement in full, or null for anything malformed: a width on anything but a line, `free` or
 * an effect on a ruler, an aura on anything but a circle, a colour that is not `#rrggbb`, too. An
 * effect this reader does not know by name is read as none: the area keeps its plain body.
 */
function parseFullMeasure(value: unknown): FullMeasure | null {
  if (!isRecord(value) || typeof value.shape !== 'string' || !FULL_SHAPES.includes(value.shape)) return null;
  const shape = value.shape as FullShape;
  const { pts, width, free, color, effect } = value;
  const ruler = shape === 'ruler';
  if (!Array.isArray(pts) || pts.length % 2 !== 0 || pts.length < 4 || pts.length > (ruler ? MAX_RULER_NUMBERS : 4) || !pts.every(isCoordinate)) return null;
  if (width !== undefined && (shape !== 'line' || !isCoordinate(width) || width <= 0)) return null;
  if (free !== undefined && (free !== true || ruler)) return null;
  if (color !== undefined && (typeof color !== 'string' || !COLOR.test(color))) return null;
  if (effect !== undefined && (ruler || typeof effect !== 'string' || !EFFECT_NAME.test(effect))) return null;
  const look = MARK_EFFECTS.find((name) => name === effect);
  const aura = value.aura === undefined ? undefined : parseAura(value.aura);
  if (aura === null || (aura !== undefined && shape !== 'circle')) return null;
  return {
    shape, pts, ...(width !== undefined && { width }), ...(free === true && { free }),
    ...(typeof color === 'string' && { color }), ...(look !== undefined && { effect: look }), ...(aura !== undefined && { aura }),
  };
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

/** A sender's measurements in full, with at most `maxKept` kept ones, or null for anything malformed. */
function parseFullMeasures(value: unknown, maxKept: number): FullMeasures | null {
  if (!isRecord(value) || !Array.isArray(value.kept) || value.kept.length > maxKept) return null;
  const live = value.live === null ? null : parseFullMeasure(value.live);
  const kept = readAll(value.kept, parseFullMeasure);
  return (value.live !== null && live === null) || kept === null ? null : { live, kept };
}

function parseMeasureState(value: Record<string, unknown>, maxKept: number): MeasureState | null {
  const { color, live, kept, span, full } = value;
  if (typeof color !== 'string' || !COLOR.test(color) || !Array.isArray(kept) || kept.length > maxKept) return null;
  if (span !== undefined && !isSpan(span)) return null;
  const measure = live === null ? null : parseMeasure(live);
  const records = readAll(kept, parseMeasure);
  const whole = full === undefined ? undefined : parseFullMeasures(full, maxKept);
  if ((live !== null && measure === null) || records === null || whole === null) return null;
  return { color, live: measure, kept: records, ...(span !== undefined && { span }), ...(whole !== undefined && { full: whole }) };
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
  const strokesRead = parseStrokeList(value.strokes);
  return {
    t: 'marks', scene, lasers: lasersRead, measures: measuresRead,
    ...(cursorsRead !== undefined && { cursors: cursorsRead }), ...(strokesRead !== undefined && { strokes: strokesRead }),
  };
}

const isCount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
const numbersOf = (drawing: SharedDrawing): number => drawing.points.length + (drawing.holes ?? []).reduce((sum, ring) => sum + ring.length, 0);

/**
 * A drawing under way, or null for one that cannot be read: a count that is none, a drawing that
 * is none or is a stamp, more drawings or points than a message may carry, or a pen's `from` on
 * anything but one drawing.
 */
export function parseStroke(value: Record<string, unknown>): StrokeState | null {
  const { n, drawings, from, span, kept } = value;
  if (!isCount(n, MAX_STROKE_COUNT) || !Array.isArray(drawings) || drawings.length > MAX_STROKE_DRAWINGS) return null;
  if (span !== undefined && !isSpan(span)) return null;
  if (from !== undefined && (!isCount(from, MAX_STROKE_FROM) || drawings.length !== 1)) return null;
  const read = readAll(drawings, (drawing) => {
    const parsed = parseDrawing(drawing);
    return parsed === null || parsed.type !== 'pen' ? null : parsed;
  });
  if (read === null || read.reduce((sum, drawing) => sum + numbersOf(drawing), 0) > MAX_STROKE_NUMBERS) return null;
  return { n, drawings: read, ...(from !== undefined && { from }), ...(span !== undefined && { span }), ...(kept === true && { kept }) };
}

/** The drawings under way of a `marks` message that can be read, one a sender at most; undefined where it names none. */
function parseStrokeList(strokes: unknown): SharedStroke[] | undefined {
  if (!Array.isArray(strokes)) return undefined;
  const read = new Map<string, SharedStroke>();
  for (const value of strokes.slice(0, MAX_PLAYERS + 1)) {
    const entry = entryOf(value);
    const stroke = entry === null ? null : parseStroke(entry.fields);
    if (entry !== null && stroke !== null && !read.has(entry.who)) read.set(entry.who, { who: entry.who, ...stroke });
  }
  return [...read.values()];
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
