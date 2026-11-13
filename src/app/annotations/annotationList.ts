/**
 * Drawings and texts as everything reads them. A map file arrives unchecked (a hand edit, a sync
 * conflict, a newer or older Atlas) and the store keeps what it holds, so that the next save
 * writes it back: what cannot be read is passed over here, at reading, and nothing is removed.
 *
 * A read annotation carries its record, so no field this Atlas does not know is lost on the way
 * to whoever writes a changed copy; the same record reads as the same annotation every time, so
 * whoever compares annotations finds unchanged ones unchanged.
 */

import type { DrawingStroke, TextElement } from '../types';
import type { Point } from '../types/visionTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';
import { isHexColor } from '../utils/hexColor';
import { fitsAnchors, fitsEllipse, fitsRectangle, isClosedPath } from './annotationFit';
import {
  DEFAULT_CELL, MAX_ANNOTATION_NAME, MAX_DRAWINGS, MAX_HOLES, MAX_STROKE_POINTS, MAX_TEXTS,
  type Annotation, type DrawingAnnotation, type DrawShape, type TextAnnotation,
} from './annotationTypes';
import { stampSize, strokeWidth, textHeight } from './drawSizes';

/** The records `annotationList` reads: a scene's `objects`, or those of one level (`levelObjects`). */
export interface AnnotationRecords {
  drawings?: Record<string, DrawingStroke> | undefined;
  texts?: Record<string, TextElement> | undefined;
}

/** What a colour that is no `#rrggbb` reads as. */
const FALLBACK_COLOR = '#ffffff';
/** The face every text had before the tool offered any; what a text without a face reads as. */
const FALLBACK_FONT = 'Arial';
/** A plate's padding where the text names none, as plates always had. */
const PLATE_PADDING = 8;

const NONE: readonly Annotation[] = [];
const NO_RECORD: Record<string, unknown> = Object.freeze({});
const lists = new WeakMap<object, WeakMap<object, readonly Annotation[]>>();
const drawingViews = new WeakMap<object, { id: string; annotation: DrawingAnnotation | null }>();
const textViews = new WeakMap<object, { id: string; annotation: TextAnnotation | null }>();

function isPoint(value: unknown): value is Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

const isName = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_ANNOTATION_NAME;
const isSize = (value: unknown): value is number => isFiniteNumber(value) && value > 0;
const colorOf = (value: unknown): string => (isHexColor(value) ? value : FALLBACK_COLOR);
const unitShare = (value: unknown): number => (isFiniteNumber(value) ? Math.min(1, Math.max(0, value)) : 1);

/**
 * The place the entry `value` of a drawings or texts record has in the one order of annotations:
 * its `order`, or 0 without one. Read anew at every call, so it may be asked of a store draft.
 */
export function annotationOrder(value: unknown): number {
  return isRecord(value) && isFiniteNumber(value.order) ? value.order : 0;
}

function shared(id: string, value: Record<string, unknown>): Pick<Annotation, 'id' | 'hidden' | 'layer' | 'locked' | 'order' | 'group' | 'by' | 'level'> {
  return {
    id,
    hidden: value.hidden === true,
    layer: value.layer === 'map' ? 'map' : 'above',
    locked: value.locked === true,
    order: annotationOrder(value),
    group: isName(value.group) ? value.group : null,
    by: isName(value.by) ? value.by : null,
    level: typeof value.level === 'string' ? value.level : undefined,
  };
}

/** The rings of `value` that are rings (three finite points at least), until `MAX_HOLES` are read or their points pass `MAX_STROKE_POINTS`. */
function holesOf(value: unknown): readonly (readonly Point[])[] {
  if (!Array.isArray(value)) return [];
  const holes: Point[][] = [];
  let budget = MAX_STROKE_POINTS;
  for (const ring of value as unknown[]) {
    if (holes.length === MAX_HOLES) break;
    if (!Array.isArray(ring) || ring.length < 3 || ring.length > budget || !ring.every(isPoint)) continue;
    budget -= ring.length;
    holes.push(ring);
  }
  return holes;
}

/** What a drawing's `type` and `anchors` make of its points; null for a type this Atlas does not know. */
function shapeOf(type: unknown, points: readonly Point[], anchors: unknown): { shape: DrawShape; anchors: readonly Point[] | null } | null {
  switch (type) {
    case 'pen': return { shape: 'pen', anchors: null };
    case 'icon': return { shape: 'stamp', anchors: null };
    case 'rectangle': return { shape: fitsRectangle(points) ? 'rectangle' : 'free', anchors: null };
    case 'circle': return { shape: fitsEllipse(points) ? 'ellipse' : 'free', anchors: null };
    case 'line': {
      if (anchors === undefined) return { shape: 'line', anchors: null };
      const fits = Array.isArray(anchors) && anchors.every(isPoint) && fitsAnchors(points, anchors);
      return fits ? { shape: 'line', anchors } : { shape: 'free', anchors: null };
    }
    default: return null;
  }
}

/** A stamp's footprint, or a line's width, where 0 is a fill without a line; M on a map without a grid for one that is no size. */
function widthOf(width: unknown, stamp: boolean): number {
  if (stamp) return isSize(width) ? width : stampSize('m', DEFAULT_CELL);
  return isFiniteNumber(width) && width >= 0 ? width : strokeWidth('m', DEFAULT_CELL);
}

function drawingOf(id: string, value: Record<string, unknown>): DrawingAnnotation | null {
  const { points, fill, dash, ends, rotation } = value;
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_STROKE_POINTS || !points.every(isPoint)) return null;
  const read = shapeOf(value.type, points, value.anchors);
  if (!read) return null;
  const stamp = read.shape === 'stamp';
  const icon = stamp && typeof value.icon === 'string' && value.icon !== '' ? value.icon : null;
  // A stamp without a symbol shows nothing and can be reached by nothing.
  if (stamp && icon === null) return null;
  const closed = !stamp && isClosedPath(points);
  const filled = closed && (fill === 'soft' || fill === 'solid') ? fill : null;
  return {
    ...shared(id, value),
    kind: 'drawing',
    record: value as unknown as DrawingStroke,
    shape: read.shape,
    points,
    closed,
    width: widthOf(value.width, stamp),
    color: colorOf(value.color),
    opacity: unitShare(value.opacity),
    fill: filled,
    holes: filled ? holesOf(value.holes) : [],
    cells: filled !== null && value.cells === true,
    dash: !stamp && (dash === 'dashed' || dash === 'dotted') ? dash : null,
    ends: !stamp && !closed && points.length >= 2 && (ends === 'end' || ends === 'both') ? ends : null,
    anchors: read.anchors,
    icon,
    rotation: stamp && isFiniteNumber(rotation) ? rotation : 0,
  };
}

/** The indexes a wrapped text's lines break at: whole numbers within the text, each after the one before; null for anything else. */
function breaksOf(value: unknown, text: string): readonly number[] | null {
  if (!Array.isArray(value) || value.length > text.length) return null;
  let last = -1;
  for (const index of value as unknown[]) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index <= last || index > text.length) return null;
    last = index;
  }
  return value as number[];
}

function textOf(id: string, value: Record<string, unknown>): TextAnnotation | null {
  const { x, y, text, fontSize, fontFamily, backgroundColor, padding, borderRadius, opacity, width, align, scale, rotation } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || typeof text !== 'string') return null;
  const plate = isHexColor(backgroundColor) ? backgroundColor : null;
  return {
    ...shared(id, value),
    kind: 'text',
    record: value as unknown as TextElement,
    x,
    y,
    text,
    fontSize: isSize(fontSize) ? fontSize : textHeight('m', DEFAULT_CELL),
    scale: isSize(scale) ? scale : 1,
    fontFamily: typeof fontFamily === 'string' && fontFamily !== '' ? fontFamily : FALLBACK_FONT,
    color: colorOf(value.color),
    look: plate ? 'plate' : value.outline === true ? 'outline' : 'plain',
    backgroundColor: plate,
    padding: isSize(padding) ? padding : PLATE_PADDING,
    borderRadius: isSize(borderRadius) ? borderRadius : 0,
    // A plate that names no opacity, or none, is solid, as plates always were.
    opacity: isSize(opacity) ? Math.min(1, opacity) : 1,
    width: isSize(width) ? width : null,
    breaks: breaksOf(value.breaks, text),
    align: align === 'left' || align === 'right' ? align : 'center',
    bold: value.bold === true,
    italic: value.italic === true,
    rotation: isFiniteNumber(rotation) ? rotation : 0,
  };
}

/**
 * A drawing as it is read: `id` is its place in the record, which is how the store finds it. None
 * without a type this Atlas knows and one to `MAX_STROKE_POINTS` finite points, and no stamp
 * without a symbol. A rectangle or ellipse whose points are none, and a line whose `anchors` do
 * not lie on it, is a free shape (`annotationFit.ts`). A colour that is not `#rrggbb` reads as
 * white, a width that is no size as M on a map without a grid, an opacity outside 0 to 1 as the
 * nearest in it, `hidden` and `locked` only where they are `true`, a fill only on a closed line
 * (and `cells` only on a fill) and arrowheads only on an open one.
 */
export function readDrawing(id: string, value: unknown): DrawingAnnotation | null {
  if (!isRecord(value)) return null;
  const known = drawingViews.get(value);
  if (known?.id === id) return known.annotation;
  const annotation = drawingOf(id, value);
  drawingViews.set(value, { id, annotation });
  return annotation;
}

/**
 * A text as it is read: `id` is its place in the record. None without a finite place and a text.
 * A colour that is not `#rrggbb` reads as white (a plate's as no plate), a font size that is no
 * size as M on a map without a grid, and everything else it cannot read as a text without it.
 */
export function readText(id: string, value: unknown): TextAnnotation | null {
  if (!isRecord(value)) return null;
  const known = textViews.get(value);
  if (known?.id === id) return known.annotation;
  const annotation = textOf(id, value);
  textViews.set(value, { id, annotation });
  return annotation;
}

function readList(drawings: Record<string, unknown>, texts: Record<string, unknown>): readonly Annotation[] {
  const read: Annotation[] = [];
  let ordered = false;
  const take = <T extends Annotation>(record: Record<string, unknown>, one: (id: string, value: unknown) => T | null, most: number): void => {
    let count = 0;
    for (const [id, value] of Object.entries(record)) {
      const annotation = one(id, value);
      if (!annotation) continue;
      read.push(annotation);
      ordered ||= annotation.order !== 0;
      if (++count === most) break;
    }
  };
  take(texts, readText, MAX_TEXTS);
  take(drawings, readDrawing, MAX_DRAWINGS);
  // Stable: annotations of one order keep texts under drawings, each as their record has them.
  return ordered ? read.sort((a, b) => a.order - b.order) : read;
}

/**
 * The annotations of `objects` in the order they are drawn, a later one lying over an earlier one:
 * by `order`, and among those of one order (0 for every annotation made before there was one) the
 * texts first and then the drawings, each in their record's order. The first `MAX_TEXTS` texts and
 * `MAX_DRAWINGS` drawings that can be read. Hand it the objects of one level (`levelObjects`). The
 * records stay as the file has them; the same list for the same pair of records.
 */
export function annotationList(objects: AnnotationRecords): readonly Annotation[] {
  const drawings: Record<string, unknown> = isRecord(objects.drawings) ? objects.drawings : NO_RECORD;
  const texts: Record<string, unknown> = isRecord(objects.texts) ? objects.texts : NO_RECORD;
  if (drawings === NO_RECORD && texts === NO_RECORD) return NONE;
  let byTexts = lists.get(drawings);
  if (!byTexts) lists.set(drawings, byTexts = new WeakMap<object, readonly Annotation[]>());
  let list = byTexts.get(texts);
  if (!list) byTexts.set(texts, list = readList(drawings, texts));
  return list;
}

/**
 * How many more drawings and texts the level whose objects these are can take: one past that is
 * kept by the store and read by nobody. Whoever adds asks first.
 */
export function annotationRoom(objects: AnnotationRecords): { drawings: number; texts: number } {
  const room = { drawings: MAX_DRAWINGS, texts: MAX_TEXTS };
  for (const annotation of annotationList(objects)) {
    if (annotation.kind === 'drawing') room.drawings--;
    else room.texts--;
  }
  return room;
}

/**
 * What of a drawing's entry lies with its `points` and goes wherever they go (a curved path's
 * `anchors`, the rings of `holes`), moved by `move`: with the map when it is drawn another way,
 * with a copy that is put down elsewhere. A field that is no list of points stays out, so the
 * entry keeps it as it is.
 */
export function anchorsAndHolesMoved(drawing: unknown, move: (point: Point) => Point): { anchors?: Point[]; holes?: Point[][] } {
  if (!isRecord(drawing)) return {};
  const { anchors, holes } = drawing;
  const isPath = (value: unknown): value is Point[] => Array.isArray(value) && value.every(isPoint);
  return {
    ...(isPath(anchors) && { anchors: anchors.map(move) }),
    ...(Array.isArray(holes) && holes.every(isPath) && { holes: holes.map((ring) => ring.map(move)) }),
  };
}
