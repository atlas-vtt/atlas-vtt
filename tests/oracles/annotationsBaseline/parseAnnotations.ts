/**
 * How drawings and texts were read before a message could say more of them than a pen's line, a
 * stamp and a text's plate: the reader as it was, kept to hold what is sent now to what a reader
 * of then makes of it. It refused a whole message for one entry it could not read.
 */

import { isRecord } from '../../../src/app/online/protocol/shape.ts';
import { COLOUR_PATTERN, MAX_COORDINATE, MAX_TOKEN_SIZE } from '../../../src/app/online/protocol/tokens.ts';

const MAX_DRAWINGS = 2_000;
const MAX_TEXTS = 500;
const MAX_DRAWING_POINTS = 200_000;
const MAX_TEXT_LENGTH = 2_000;
const MAX_FONT_NAME = 100;
const ICON_PATTERN = /^[a-z0-9-]{1,40}$/;
const FONT_PATTERN = /^[\p{L}\p{N} ,'"_-]*$/u;
const ALIGNS = ['left', 'center', 'right'] as const;

/** A drawing on the map: a stroke through its points (flat `[x0, y0, …]`) or an icon stamp at its one point. */
export interface FormerDrawing {
  readonly type: 'pen' | 'icon';
  readonly points: readonly number[];
  readonly colour: string;
  readonly width: number;
  readonly opacity: number;
  readonly icon?: string;
}

/** A text on the map, as Atlas's text tool stores it. */
export interface FormerText {
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

export interface FormerAnnotations {
  readonly drawings: readonly FormerDrawing[];
  readonly texts: readonly FormerText[];
}

const isIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isPlace = (value: unknown): value is number => isIn(value, -MAX_COORDINATE, MAX_COORDINATE);
const isColour = (value: unknown): value is string => typeof value === 'string' && COLOUR_PATTERN.test(value);
const oneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

function isPoints(value: unknown, max: number): value is number[] {
  return Array.isArray(value) && value.length % 2 === 0 && value.length <= max * 2 && value.every(isPlace);
}

function parseDrawing(value: unknown): FormerDrawing | null {
  if (!isRecord(value) || (value.type !== 'pen' && value.type !== 'icon') || !isColour(value.colour)) return null;
  if (!isIn(value.width, 0, MAX_TOKEN_SIZE) || !isIn(value.opacity, 0, 1)) return null;
  if (value.type === 'icon') {
    if (!isPoints(value.points, 1) || value.points.length !== 2 || typeof value.icon !== 'string' || !ICON_PATTERN.test(value.icon)) return null;
    return { type: 'icon', points: value.points, colour: value.colour, width: value.width, opacity: value.opacity, icon: value.icon };
  }
  if (!isPoints(value.points, MAX_DRAWING_POINTS) || value.points.length === 0) return null;
  return { type: 'pen', points: value.points, colour: value.colour, width: value.width, opacity: value.opacity };
}

function parseText(value: unknown): FormerText | null {
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
export function formerParseAnnotations(value: Record<string, unknown>): FormerAnnotations | null {
  if (!Array.isArray(value.drawings) || value.drawings.length > MAX_DRAWINGS || !Array.isArray(value.texts) || value.texts.length > MAX_TEXTS) return null;
  const drawings: FormerDrawing[] = [];
  let points = 0;
  for (const entry of value.drawings) {
    const drawing = parseDrawing(entry);
    if (drawing === null) return null;
    points += drawing.points.length / 2;
    if (points > MAX_DRAWING_POINTS) return null;
    drawings.push(drawing);
  }
  const texts: FormerText[] = [];
  for (const entry of value.texts) {
    const text = parseText(entry);
    if (text === null) return null;
    texts.push(text);
  }
  return { drawings, texts };
}
