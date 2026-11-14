import { isIconKey } from './mapLayers.ts';
import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_COORDINATE, MAX_TOKEN_SIZE } from './tokens.ts';

/** Drawings and texts one message may carry, and the points of all its drawings together. */
export const MAX_DRAWINGS = 2_000;
export const MAX_TEXTS = 500;
export const MAX_DRAWING_POINTS = 200_000;
/** The longest text on the map, and its font's name. */
export const MAX_TEXT_LENGTH = 2_000;
export const MAX_FONT_NAME = 100;
/** The rings cut out of one drawing's fill. */
export const MAX_DRAWING_HOLES = 256;
/** The farthest a drawing's or a text's place in the one order lies from 0. */
export const MAX_ANNOTATION_ORDER = 1_000_000_000;
/**
 * The level of a GM that tells drawings and texts as its Draw tool makes them: a drawing's shape
 * and look beside its line, a text's outline and wrapped lines, the one order of both, those that
 * lie on the map (`SharedAnnotations.onMap`), and the drawing under way (`MarksMessage.strokes`).
 * A GM below it draws a pen's stroke as the line through its points, and so does its reader.
 */
export const DRAW_GM_LEVEL = 13;
/** A font family as a text names it: names, quotes, commas and spaces only. */
const FONT_PATTERN = /^[\p{L}\p{N} ,'"_-]*$/u;
const ALIGNS = ['left', 'center', 'right'] as const;

export const DRAWING_SHAPES = ['line', 'rectangle', 'ellipse'] as const;
export const DRAWING_FILLS = ['soft', 'solid'] as const;
export const DRAWING_DASHES = ['dashed', 'dotted'] as const;
export const DRAWING_ENDS = ['end', 'both'] as const;

/**
 * A drawing on the map: a stroke through its points (flat `[x0, y0, …]`) or an icon stamp at its one point.
 * `width` is the stroke's, or the stamp's side; a stroke of width 0 has no line, only a fill.
 *
 * What a drawing is beyond the line through its points was added later, and every reader that does
 * not know one of these draws that line: `shape` says what the points are where they are no pen's
 * stroke (a line whose corners stay corners, the five points of a rectangle, the sampled outline of
 * an ellipse), `curved` that a line is a curve through its points, `fill` that a closed line's
 * inside is filled in its colour (soft: a quarter of it) less the rings of `holes` (each flat, three
 * points at least), `dash` and `ends` how the line is drawn and whether it ends in arrowheads,
 * `turn` how far a stamp is turned (degrees, clockwise), and `order` where it lies among the
 * drawings and texts of its message (a later one over an earlier one; none is 0, and of one order
 * texts lie under drawings, each as their list has them).
 */
export interface SharedDrawing {
  readonly type: 'pen' | 'icon';
  readonly points: readonly number[];
  readonly colour: string;
  readonly width: number;
  readonly opacity: number;
  readonly icon?: string;
  readonly shape?: (typeof DRAWING_SHAPES)[number];
  readonly curved?: true;
  readonly fill?: (typeof DRAWING_FILLS)[number];
  readonly holes?: readonly (readonly number[])[];
  readonly dash?: (typeof DRAWING_DASHES)[number];
  readonly ends?: (typeof DRAWING_ENDS)[number];
  readonly turn?: number;
  readonly order?: number;
}

/**
 * A text on the map, as Atlas's text tool stores it. Added later, and left alone by a reader that
 * does not know them: `outline` (a halo around the letters, on a text without a background),
 * `wrap` (the width its words wrap at, in the units of `fontSize`) with `breaks` (the indexes into
 * `text` its wrapped lines begin at, as its writer measured them), and `order` (as a drawing's).
 */
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
  readonly outline?: true;
  readonly wrap?: number;
  readonly breaks?: readonly number[];
  readonly order?: number;
}

/** Drawings and texts, each list in the order its entries lie in. */
export interface SharedAnnotationLists {
  readonly drawings: readonly SharedDrawing[];
  readonly texts: readonly SharedText[];
}

/**
 * The drawings and texts players see. `drawings` and `texts` lie above the tokens and the
 * lighting, under the fog. `onMap` (added later; a reader that does not know it shows none of it)
 * holds those that lie on the map itself: under the grid and the tokens, and lit by the lighting
 * like the floor, so they show only where the map does.
 */
export interface SharedAnnotations extends SharedAnnotationLists {
  readonly onMap?: SharedAnnotationLists;
}

const isIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isPlace = (value: unknown): value is number => isIn(value, -MAX_COORDINATE, MAX_COORDINATE);
const isColour = (value: unknown): value is string => typeof value === 'string' && COLOUR_PATTERN.test(value);
const oneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

function isPoints(value: unknown, max: number): value is number[] {
  return Array.isArray(value) && value.length % 2 === 0 && value.length <= max * 2 && value.every(isPlace);
}

/** A ring of a fill's holes: flat, three points at least. */
const isRing = (value: unknown): value is number[] => isPoints(value, MAX_DRAWING_POINTS) && value.length >= 6;

/**
 * What a drawing says beyond its line. Each is read by itself: one that cannot be read is left
 * out, and the drawing is what the others say.
 */
function drawingLook(value: Record<string, unknown>): Partial<SharedDrawing> {
  const { shape, fill, holes, dash, ends, order } = value;
  const rings = Array.isArray(holes) && holes.length > 0 && holes.length <= MAX_DRAWING_HOLES && holes.every(isRing) ? holes : undefined;
  return {
    ...(oneOf(DRAWING_SHAPES, shape) && { shape }),
    ...(value.curved === true && { curved: true as const }),
    ...(oneOf(DRAWING_FILLS, fill) && { fill }),
    ...(rings !== undefined && { holes: rings }),
    ...(oneOf(DRAWING_DASHES, dash) && { dash }),
    ...(oneOf(DRAWING_ENDS, ends) && { ends }),
    ...orderField(order),
  };
}

const orderField = (order: unknown): { order?: number } => (isIn(order, -MAX_ANNOTATION_ORDER, MAX_ANNOTATION_ORDER) && order !== 0 ? { order } : {});

/** A drawing, or null for one that cannot be read: its line (or a stamp's place and icon), colour, width and opacity must be there. */
export function parseDrawing(value: unknown): SharedDrawing | null {
  if (!isRecord(value) || (value.type !== 'pen' && value.type !== 'icon') || !isColour(value.colour)) return null;
  if (!isIn(value.width, 0, MAX_TOKEN_SIZE) || !isIn(value.opacity, 0, 1)) return null;
  if (value.type === 'icon') {
    if (!isPoints(value.points, 1) || value.points.length !== 2 || !isIconKey(value.icon)) return null;
    const turned = isIn(value.turn, -360, 360) && value.turn !== 0;
    return {
      type: 'icon', points: value.points, colour: value.colour, width: value.width, opacity: value.opacity, icon: value.icon,
      ...(turned && { turn: value.turn as number }), ...orderField(value.order),
    };
  }
  if (!isPoints(value.points, MAX_DRAWING_POINTS) || value.points.length === 0) return null;
  return { type: 'pen', points: value.points, colour: value.colour, width: value.width, opacity: value.opacity, ...drawingLook(value) };
}

/** The indexes a wrapped text's lines begin at: whole numbers within the text, each after the one before. */
function isBreaks(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length > length) return false;
  let last = -1;
  for (const index of value as unknown[]) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index <= last || index > length) return false;
    last = index;
  }
  return true;
}

function parseText(value: unknown): SharedText | null {
  if (!isRecord(value) || !isPlace(value.x) || !isPlace(value.y) || typeof value.text !== 'string' || value.text.length > MAX_TEXT_LENGTH) return null;
  const { fontFamily, background, wrap, breaks } = value;
  if (typeof fontFamily !== 'string' || fontFamily.length > MAX_FONT_NAME || !FONT_PATTERN.test(fontFamily)) return null;
  if (!isIn(value.fontSize, 1, 10_000) || !isColour(value.colour) || (background !== null && !isColour(background))) return null;
  if (!isIn(value.padding, 0, 10_000) || !isIn(value.radius, 0, 10_000) || !isIn(value.opacity, 0, 1) || !oneOf(ALIGNS, value.align)) return null;
  if (typeof value.bold !== 'boolean' || typeof value.italic !== 'boolean' || !isIn(value.rotation, -360, 360) || !isIn(value.scale, 0.001, 1_000)) return null;
  const wraps = isIn(wrap, Number.MIN_VALUE, MAX_TOKEN_SIZE);
  return {
    x: value.x, y: value.y, text: value.text, fontSize: value.fontSize, fontFamily, colour: value.colour, background,
    padding: value.padding, radius: value.radius, opacity: value.opacity, align: value.align, bold: value.bold, italic: value.italic, rotation: value.rotation, scale: value.scale,
    ...(value.outline === true && { outline: true as const }),
    ...(wraps && { wrap }),
    // Breaks say where a text of this width was broken: without the width they say nothing.
    ...(wraps && isBreaks(breaks, value.text.length) && { breaks }),
    ...orderField(value.order),
  };
}

/** How many drawings, texts and points a message has room for yet. */
interface Room {
  drawings: number;
  texts: number;
  points: number;
}

/** The points a drawing counts for: those of its line and of its holes. */
const pointCount = (drawing: SharedDrawing): number => (drawing.points.length + (drawing.holes ?? []).reduce((sum, ring) => sum + ring.length, 0)) / 2;

/**
 * The drawings and texts of two lists that can be read, while there is room for them: an entry
 * that cannot be read, and one there is no room for, is passed over. Null where either is no list.
 */
function parseLists(drawings: unknown, texts: unknown, room: Room): SharedAnnotationLists | null {
  if (!Array.isArray(drawings) || !Array.isArray(texts)) return null;
  const readDrawings: SharedDrawing[] = [];
  for (const entry of drawings) {
    if (room.drawings === 0) break;
    const drawing = parseDrawing(entry);
    if (drawing === null) continue;
    const points = pointCount(drawing);
    if (points > room.points) continue;
    room.points -= points;
    room.drawings -= 1;
    readDrawings.push(drawing);
  }
  const readTexts: SharedText[] = [];
  for (const entry of texts) {
    if (room.texts === 0) break;
    const text = parseText(entry);
    if (text === null) continue;
    room.texts -= 1;
    readTexts.push(text);
  }
  return { drawings: readDrawings, texts: readTexts };
}

/**
 * The drawings and texts of an `annotations` message, or null when it holds no lists of them. An
 * entry that cannot be read is passed over and the rest is read; so is what lies past the most a
 * message may carry (`MAX_DRAWINGS`, `MAX_TEXTS` and `MAX_DRAWING_POINTS`, counted over those above
 * the tokens and those on the map together, the ones above first).
 */
export function parseAnnotations(value: Record<string, unknown>): SharedAnnotations | null {
  const room: Room = { drawings: MAX_DRAWINGS, texts: MAX_TEXTS, points: MAX_DRAWING_POINTS };
  const above = parseLists(value.drawings, value.texts, room);
  if (above === null) return null;
  const onMap = isRecord(value.onMap) ? parseLists(value.onMap.drawings, value.onMap.texts, room) : null;
  return onMap === null ? above : { ...above, onMap };
}
