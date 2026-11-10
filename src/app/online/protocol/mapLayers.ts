import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_COORDINATE, MAX_TOKEN_SIZE, MAX_TOKENS } from './tokens.ts';

/** Door badges one message may carry. */
export const MAX_DOOR_BADGES = 2_000;
/** Drawings and texts one message may carry, and the points of all its drawings together. */
export const MAX_DRAWINGS = 2_000;
export const MAX_TEXTS = 500;
export const MAX_DRAWING_POINTS = 200_000;
/** Readable pins one message may carry. */
export const MAX_SHARED_PINS = 500;
/** The longest text on the map, and its font's name. */
export const MAX_TEXT_LENGTH = 2_000;
export const MAX_FONT_NAME = 100;
/** A stamp's icon: the key Atlas names it by. */
const ICON_PATTERN = /^[a-z0-9-]{1,40}$/;
/** A numbered or lettered pin's label, as Atlas gives one: digits, or capitals. */
const PIN_LABEL_PATTERN = /^(?:[0-9]{1,6}|[A-Z]{1,6})$/;

/** A GM's pin's icon as Atlas names it, as a field to spread; none where there is none or it cannot be read. */
export const pinIconField = (value: unknown): { icon?: string } => (typeof value === 'string' && ICON_PATTERN.test(value) ? { icon: value } : {});

/** A numbered or lettered pin's label, as a field to spread; none where there is none or it cannot be read. */
export const pinLabelField = (value: unknown): { label?: string } => (typeof value === 'string' && PIN_LABEL_PATTERN.test(value) ? { label: value } : {});
/** A font family as a text names it: names, quotes, commas and spaces only. */
const FONT_PATTERN = /^[\p{L}\p{N} ,'"_-]*$/u;

export const GRID_TYPES = ['square', 'hex-horizontal', 'hex-vertical'] as const;
export const GRID_LINE_TYPES = ['solid', 'dashed', 'dotted'] as const;
export const CELL_NUMBER_FORMATS = ['column-row', 'sequential', 'letter-number'] as const;
const ALIGNS = ['left', 'center', 'right'] as const;

/** The grid as the players' picture draws it: Atlas's grid options. */
export interface SharedGrid {
  readonly type: (typeof GRID_TYPES)[number];
  readonly size: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** `#rrggbb`; null picks black or white from the map, as Atlas does. */
  readonly colour: string | null;
  readonly alpha: number;
  readonly lineWidth: number;
  readonly lineType: (typeof GRID_LINE_TYPES)[number];
  readonly numbers: { readonly format: (typeof CELL_NUMBER_FORMATS)[number]; readonly opacity: number } | null;
}

/** The badge of a door the players see: the door's ends and whether it stands open. */
export interface SharedDoor {
  readonly p: readonly [number, number, number, number];
  readonly open: boolean;
}

/** A token the players only sense: where it stands and how large it is (diameter, world pixels). */
export interface SensedMark {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** A drawing on the map: a stroke through its points (flat `[x0, y0, …]`) or an icon stamp at its one point. */
export interface SharedDrawing {
  readonly type: 'pen' | 'icon';
  readonly points: readonly number[];
  readonly colour: string;
  readonly width: number;
  readonly opacity: number;
  readonly icon?: string;
}

/** A text on the map, as Atlas's text tool stores it. */
export interface SharedText {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly colour: string;
  readonly background: string | null;
  readonly padding: number;
  readonly radius: number;
  readonly opacity: number;
  readonly align: (typeof ALIGNS)[number];
  readonly bold: boolean;
  readonly italic: boolean;
  readonly rotation: number;
  readonly scale: number;
}

/**
 * A pin the GM made readable, where the players see the map now: its place, its icon (the key Atlas
 * names it by), the label of a numbered or lettered pin, and the log entry that tells who found it
 * (null until someone did). `id` is an alias, never the pin's id in the GM's scene, and nothing of its
 * note comes with it.
 */
export interface SharedPin {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly icon: string;
  readonly label?: string;
  readonly found: string | null;
}

/** A player opens a readable pin they see in scene `scene`: the first time, that finds it. */
export interface PlayerPinFound {
  readonly t: 'pin-found';
  readonly scene: string;
  readonly pin: string;
}

export interface SharedAnnotations {
  readonly drawings: readonly SharedDrawing[];
  readonly texts: readonly SharedText[];
}

const isIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isPlace = (value: unknown): value is number => isIn(value, -MAX_COORDINATE, MAX_COORDINATE);
const isColour = (value: unknown): value is string => typeof value === 'string' && COLOUR_PATTERN.test(value);
const oneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

function isPoints(value: unknown, max: number): value is number[] {
  return Array.isArray(value) && value.length % 2 === 0 && value.length <= max * 2 && value.every(isPlace);
}

/** The grid of a `grid` message: null for none shown, undefined for anything malformed. */
export function parseGrid(value: unknown): SharedGrid | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !oneOf(GRID_TYPES, value.type) || !isIn(value.size, 1, MAX_TOKEN_SIZE) || !isPlace(value.offsetX) || !isPlace(value.offsetY)) return undefined;
  if ((value.colour !== null && !isColour(value.colour)) || !isIn(value.alpha, 0, 1) || !isIn(value.lineWidth, 0, 100) || !oneOf(GRID_LINE_TYPES, value.lineType)) return undefined;
  let numbers: SharedGrid['numbers'] = null;
  const shown = value.numbers;
  if (shown !== null) {
    if (!isRecord(shown) || !oneOf(CELL_NUMBER_FORMATS, shown.format) || !isIn(shown.opacity, 0, 1)) return undefined;
    numbers = { format: shown.format, opacity: shown.opacity };
  }
  return {
    type: value.type, size: value.size, offsetX: value.offsetX, offsetY: value.offsetY, colour: value.colour,
    alpha: value.alpha, lineWidth: value.lineWidth, lineType: value.lineType, numbers,
  };
}

/** The badges of a `doors` message, or null when any is malformed. */
export function parseDoors(value: unknown): SharedDoor[] | null {
  if (!Array.isArray(value) || value.length > MAX_DOOR_BADGES) return null;
  const doors: SharedDoor[] = [];
  for (const door of value) {
    if (!isRecord(door) || !isPoints(door.p, 2) || door.p.length !== 4 || typeof door.open !== 'boolean') return null;
    const [x1, y1, x2, y2] = door.p as [number, number, number, number];
    doors.push({ p: [x1, y1, x2, y2], open: door.open });
  }
  return doors;
}

/** The marks of a `sensed` message, or null when any is malformed. */
export function parseSensed(value: unknown): SensedMark[] | null {
  if (!Array.isArray(value) || value.length > MAX_TOKENS) return null;
  const marks: SensedMark[] = [];
  for (const mark of value) {
    if (!isRecord(mark) || !isPlace(mark.x) || !isPlace(mark.y) || !isIn(mark.size, Number.MIN_VALUE, MAX_TOKEN_SIZE)) return null;
    marks.push({ x: mark.x, y: mark.y, size: mark.size });
  }
  return marks;
}

function parseDrawing(value: unknown): SharedDrawing | null {
  if (!isRecord(value) || (value.type !== 'pen' && value.type !== 'icon') || !isColour(value.colour)) return null;
  if (!isIn(value.width, 0, MAX_TOKEN_SIZE) || !isIn(value.opacity, 0, 1)) return null;
  if (value.type === 'icon') {
    if (!isPoints(value.points, 1) || value.points.length !== 2 || typeof value.icon !== 'string' || !ICON_PATTERN.test(value.icon)) return null;
    return { type: 'icon', points: value.points, colour: value.colour, width: value.width, opacity: value.opacity, icon: value.icon };
  }
  if (!isPoints(value.points, MAX_DRAWING_POINTS) || value.points.length === 0) return null;
  return { type: 'pen', points: value.points, colour: value.colour, width: value.width, opacity: value.opacity };
}

function parseText(value: unknown): SharedText | null {
  if (!isRecord(value) || !isPlace(value.x) || !isPlace(value.y) || typeof value.text !== 'string' || value.text.length > MAX_TEXT_LENGTH) return null;
  const { fontFamily, background } = value;
  if (typeof fontFamily !== 'string' || fontFamily.length > MAX_FONT_NAME || !FONT_PATTERN.test(fontFamily)) return null;
  if (!isIn(value.fontSize, 1, 10_000) || !isColour(value.colour) || (background !== null && !isColour(background))) return null;
  if (!isIn(value.padding, 0, 10_000) || !isIn(value.radius, 0, 10_000) || !isIn(value.opacity, 0, 1) || !oneOf(ALIGNS, value.align)) return null;
  if (typeof value.bold !== 'boolean' || typeof value.italic !== 'boolean' || !isIn(value.rotation, -360, 360) || !isIn(value.scale, 0.001, 1_000)) return null;
  return {
    x: value.x, y: value.y, text: value.text, fontSize: value.fontSize, fontFamily, colour: value.colour, background,
    padding: value.padding, radius: value.radius, opacity: value.opacity, align: value.align, bold: value.bold, italic: value.italic, rotation: value.rotation, scale: value.scale,
  };
}

/** The drawings and texts of an `annotations` message, or null when any is malformed or there are too many. */
export function parseAnnotations(value: Record<string, unknown>): SharedAnnotations | null {
  if (!Array.isArray(value.drawings) || value.drawings.length > MAX_DRAWINGS || !Array.isArray(value.texts) || value.texts.length > MAX_TEXTS) return null;
  const drawings: SharedDrawing[] = [];
  let points = 0;
  for (const entry of value.drawings) {
    const drawing = parseDrawing(entry);
    if (drawing === null) return null;
    points += drawing.points.length / 2;
    if (points > MAX_DRAWING_POINTS) return null;
    drawings.push(drawing);
  }
  const texts: SharedText[] = [];
  for (const entry of value.texts) {
    const text = parseText(entry);
    if (text === null) return null;
    texts.push(text);
  }
  return { drawings, texts };
}

/** A pin's id as players know it, and a log entry's id: 96 random bits in hex. */
const ALIAS_PATTERN = /^[0-9a-f]{24}$/;
const isAlias = (value: unknown): value is string => typeof value === 'string' && ALIAS_PATTERN.test(value);

/** The pins of a `pins` message, or null when any is malformed or there are too many. */
export function parsePins(value: unknown): SharedPin[] | null {
  if (!Array.isArray(value) || value.length > MAX_SHARED_PINS) return null;
  const pins: SharedPin[] = [];
  for (const pin of value) {
    if (!isRecord(pin) || !isAlias(pin.id) || !isPlace(pin.x) || !isPlace(pin.y) || typeof pin.icon !== 'string' || !ICON_PATTERN.test(pin.icon)) return null;
    if (pin.found !== null && !isAlias(pin.found)) return null;
    pins.push({ id: pin.id, x: pin.x, y: pin.y, icon: pin.icon, ...pinLabelField(pin.label), found: pin.found });
  }
  return pins;
}

/** A player's `pin-found` message, or null for anything malformed. */
export function parsePinFound(value: Record<string, unknown>, isScene: (scene: unknown) => scene is string): PlayerPinFound | null {
  return isScene(value.scene) && isAlias(value.pin) ? { t: 'pin-found', scene: value.scene, pin: value.pin } : null;
}
