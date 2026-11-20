import { DRAWING_DASHES, DRAWING_ENDS, DRAWING_FILLS } from './annotations.ts';
import {
  DRAW_FONT_NAMES, DRAW_REFUSALS, DRAW_SHAPE_MODES, DRAW_SIZE_NAMES, DRAW_TEXT_LOOKS, isDrawBreaks, isDrawColour, isDrawCount, isDrawId, isDrawIds, isDrawScene, isDrawNumbers, isDrawPlace,
  MAX_DRAW_NUMBERS, MAX_DRAW_REQUEST, MAX_OWN_ANCHOR_NUMBERS, MAX_PLAYER_DRAWINGS, MAX_PLAYER_STROKE_POINTS, MAX_PLAYER_TEXT_LENGTH, MAX_PLAYER_TEXTS, MAX_STROKE_SPAN_MS, isOneOf, parseDrawLook, parseDrawTextLook,
  type DrawLinePlace, type DrawMap, type DrawMine, type DrawOwn, type DrawRefused, type DrawShapeMode, type DrawStylePick, type DrawWordsPlace, type PlayerDrawChange, type PlayerDrawMessage,
} from './draw.ts';
import { SHOWN, UNSEEN, UNSHOWN } from './identity.ts';
import { isRecord } from './shape.ts';
import { MAX_COORDINATE } from './tokens.ts';

/** What every request of a player's Draw tool says, as its parser hands it on. */
interface DrawRequest {
  readonly scene: string;
  readonly n: number;
}

const orNull = <T>(list: readonly T[], value: unknown): value is T | null => value === null || isOneOf(list, value);

const PICK_FIELDS = ['colour', 'size', 'seeThrough', 'dash', 'ends', 'curved', 'fill', 'font', 'look'] as const;

/**
 * One pick of the tool's bars, or null for anything else: an object with exactly one field the
 * bars have, with a value that field takes. A field the bars do not have is not read, so a pick
 * of nothing else is none.
 */
export function parseDrawStyle(value: unknown): DrawStylePick | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).filter((key) => isOneOf(PICK_FIELDS, key));
  if (keys.length !== 1) return null;
  const { colour, size, seeThrough, dash, ends, curved, fill, font, look } = value;
  switch (keys[0]) {
    case 'colour': return isDrawColour(colour) ? { colour } : null;
    case 'size': return isOneOf(DRAW_SIZE_NAMES, size) ? { size } : null;
    case 'seeThrough': return typeof seeThrough === 'boolean' ? { seeThrough } : null;
    case 'dash': return orNull(DRAWING_DASHES, dash) ? { dash } : null;
    case 'ends': return orNull(DRAWING_ENDS, ends) ? { ends } : null;
    case 'curved': return typeof curved === 'boolean' ? { curved } : null;
    case 'fill': return orNull(DRAWING_FILLS, fill) ? { fill } : null;
    case 'font': return isOneOf(DRAW_FONT_NAMES, font) ? { font } : null;
    case 'look': return isOneOf(DRAW_TEXT_LOOKS, look) ? { look } : null;
    default: return null;
  }
}

/** The largest factor a map of the plane may have, and the farthest it may shift. */
const MAX_MAP_FACTOR = 1_000;
const MAX_MAP_SHIFT = 4 * MAX_COORDINATE;

const isWithin = (value: unknown, most: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= most;

function parseDrawMap(value: unknown): DrawMap | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const [a, b, c, d, tx, ty, turn] = value as unknown[];
  if (!isWithin(a, MAX_MAP_FACTOR) || !isWithin(b, MAX_MAP_FACTOR) || !isWithin(c, MAX_MAP_FACTOR) || !isWithin(d, MAX_MAP_FACTOR)) return null;
  return isWithin(tx, MAX_MAP_SHIFT) && isWithin(ty, MAX_MAP_SHIFT) && isWithin(turn, 360) ? [a, b, c, d, tx, ty, turn] : null;
}

function parseLinePlace(value: unknown): DrawLinePlace | null {
  if (!isRecord(value) || !isDrawNumbers(value.pts, MAX_DRAW_NUMBERS) || value.pts.length === 0) return null;
  const { from, anchors } = value;
  if (from !== undefined && !isDrawCount(from, MAX_PLAYER_STROKE_POINTS)) return null;
  if (anchors !== undefined && (!isDrawNumbers(anchors, MAX_DRAW_NUMBERS) || anchors.length < 4)) return null;
  return { pts: value.pts, ...(from !== undefined && { from }), ...(anchors !== undefined && { anchors }) };
}

const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;

/**
 * A text as a player may write it on the map: its lines without controls, direction marks and
 * characters that do not show, without the white space after its last letter, at most
 * `MAX_PLAYER_TEXT_LENGTH` long; null when nothing that shows is left, or too much. A page cleans
 * what was typed with this before it measures and sends it, so the places its lines break at
 * (`breaks`) count in the words the GM writes.
 */
export function drawnText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_PLAYER_TEXT_LENGTH * 4) return null;
  const text = value.split(LINE_BREAK).map((line) => line.replace(UNSHOWN, ' ').replace(UNSEEN, '')).join('\n').replace(/\s+$/, '');
  return SHOWN.test(text) && text.length <= MAX_PLAYER_TEXT_LENGTH ? text : null;
}

/** A text's words as the GM takes them: as `drawnText` leaves them. */
const isWords = (value: unknown): value is string => typeof value === 'string' && drawnText(value) === value;
const isWrap = (value: unknown): value is number => isDrawPlace(value) && value > 0;

function parseWordsPlace(value: unknown): DrawWordsPlace | null {
  if (!isRecord(value) || !isDrawPlace(value.x) || !isDrawPlace(value.y)) return null;
  const { text, wrap, breaks } = value;
  if ((text !== undefined && !isWords(text)) || (wrap !== undefined && !isWrap(wrap))) return null;
  if (breaks !== undefined && !isDrawBreaks(breaks, MAX_PLAYER_TEXT_LENGTH)) return null;
  return { x: value.x, y: value.y, ...(text !== undefined && { text }), ...(wrap !== undefined && { wrap }), ...(breaks !== undefined && { breaks }) };
}

function parseChange(value: Record<string, unknown>, request: DrawRequest): PlayerDrawChange | null {
  if (!isDrawIds(value.ids)) return null;
  const ways = (['map', 'style', 'line', 'words'] as const).filter((way) => value[way] !== undefined);
  if (ways.length !== 1) return null;
  const base = { t: 'draw-change' as const, ...request, ids: value.ids };
  if (ways[0] === 'map') {
    const map = parseDrawMap(value.map);
    return map === null ? null : { ...base, map };
  }
  if (ways[0] === 'style') {
    const style = parseDrawStyle(value.style);
    return style === null ? null : { ...base, style };
  }
  // One drawing or text is set anew at a time.
  if (value.ids.length !== 1) return null;
  if (ways[0] === 'line') {
    const line = parseLinePlace(value.line);
    return line === null ? null : { ...base, line };
  }
  const words = parseWordsPlace(value.words);
  return words === null ? null : { ...base, words };
}

/** What a gesture made: a mode, its points and whether its line is closed; null for anything malformed. */
function parseMade(value: Record<string, unknown>): { readonly mode: DrawShapeMode; readonly pts: readonly number[]; readonly closed?: true; readonly from?: number } | null {
  const { mode, pts, closed, from } = value;
  if (!isOneOf(DRAW_SHAPE_MODES, mode) || !isDrawNumbers(pts, MAX_DRAW_NUMBERS)) return null;
  if ((closed !== undefined && (closed !== true || mode !== 'line')) || (from !== undefined && (!isDrawCount(from, MAX_PLAYER_STROKE_POINTS) || mode === 'rectangle' || mode === 'ellipse'))) return null;
  // A rectangle and an ellipse are the two corners of their box.
  if ((mode === 'rectangle' || mode === 'ellipse') && pts.length !== 4) return null;
  return { mode, pts, ...(closed === true && { closed }), ...(from !== undefined && { from }) };
}

/** A message of a player's Draw tool as the GM reads it, or null for anything malformed. */
export function parsePlayerDraw(value: Record<string, unknown>): PlayerDrawMessage | null {
  const { scene, n } = value;
  if (!isDrawScene(scene) || !isDrawCount(n, MAX_DRAW_REQUEST)) return null;
  const request: DrawRequest = { scene, n };
  switch (value.t) {
    case 'stroke': {
      if (value.mode === null) return { t: 'stroke', ...request, mode: null, pts: [] };
      const made = parseMade(value);
      const look = parseDrawLook(value.look);
      const { span } = value;
      if (made === null || look === null || (span !== undefined && !isDrawCount(span, MAX_STROKE_SPAN_MS))) return null;
      return { t: 'stroke', ...request, ...made, look, ...(span !== undefined && { span }) };
    }
    case 'draw-points':
      return isDrawCount(value.from, MAX_PLAYER_STROKE_POINTS) && isDrawNumbers(value.pts, MAX_DRAW_NUMBERS) && value.pts.length > 0 ? { t: 'draw-points', ...request, from: value.from, pts: value.pts } : null;
    case 'draw-add': {
      const made = parseMade(value);
      const look = parseDrawLook(value.look);
      return made === null || look === null || made.pts.length === 0 ? null : { t: 'draw-add', ...request, ...made, look };
    }
    case 'draw-text': {
      const { x, y, text, wrap, breaks } = value;
      const look = parseDrawTextLook(value.look);
      if (look === null || !isDrawPlace(x) || !isDrawPlace(y) || !isWords(text)) return null;
      if (wrap !== undefined && !isWrap(wrap)) return null;
      if (breaks !== undefined && (wrap === undefined || !isDrawBreaks(breaks, text.length))) return null;
      return { t: 'draw-text', ...request, x, y, text, ...(wrap !== undefined && { wrap }), ...(breaks !== undefined && { breaks }), look };
    }
    case 'draw-change':
      return parseChange(value, request);
    case 'draw-remove':
      return isDrawIds(value.ids) ? { t: 'draw-remove', ...request, ids: value.ids } : null;
    case 'draw-erase': {
      const { pts, size, whole } = value;
      if (!isDrawNumbers(pts, MAX_DRAW_NUMBERS) || pts.length === 0 || !isOneOf(DRAW_SIZE_NAMES, size) || (whole !== undefined && whole !== true)) return null;
      return { t: 'draw-erase', ...request, pts, size, ...(whole === true && { whole }) };
    }
    default:
      return null;
  }
}

/** The own drawings or texts of a `draw-mine` message that can be read: an entry that cannot is passed over, and so is an id or a place named twice. */
function parseOwn(value: unknown, most: number): DrawOwn[] | null {
  if (!Array.isArray(value)) return null;
  const read: DrawOwn[] = [];
  const ids = new Set<string>();
  const places = new Set<number>();
  for (const entry of value.slice(0, most) as unknown[]) {
    if (!isRecord(entry) || !isDrawId(entry.id) || !isDrawCount(entry.at, Number.MAX_SAFE_INTEGER) || ids.has(entry.id) || places.has(entry.at)) continue;
    ids.add(entry.id);
    places.add(entry.at);
    // Anchors that cannot be read are left out: the curve is then moved as everyone else's would be.
    const anchors = isDrawNumbers(entry.anchors, MAX_OWN_ANCHOR_NUMBERS) && entry.anchors.length >= 4 ? { anchors: entry.anchors } : {};
    read.push({ at: entry.at, id: entry.id, ...anchors });
  }
  return read;
}

/** A `draw-mine` message as the client reads it, or null for anything malformed. */
export function parseDrawMine(value: Record<string, unknown>): DrawMine | null {
  const { scene, rev, seen } = value;
  const drawings = parseOwn(value.drawings, MAX_PLAYER_DRAWINGS);
  const texts = parseOwn(value.texts, MAX_PLAYER_TEXTS);
  if (!isDrawScene(scene) || !isDrawCount(rev, Number.MAX_SAFE_INTEGER) || !isDrawCount(seen, MAX_DRAW_REQUEST) || drawings === null || texts === null) return null;
  return { t: 'draw-mine', scene, rev, drawings, texts, seen };
}

/** A `draw-refused` message as the client reads it, or null for anything malformed; a reason this reader does not know reads as `shape`. */
export function parseDrawRefused(value: Record<string, unknown>): DrawRefused | null {
  const { scene, n, reason } = value;
  if (!isDrawScene(scene) || !isDrawCount(n, MAX_DRAW_REQUEST) || typeof reason !== 'string') return null;
  return { t: 'draw-refused', scene, n, reason: isOneOf(DRAW_REFUSALS, reason) ? reason : 'shape' };
}
