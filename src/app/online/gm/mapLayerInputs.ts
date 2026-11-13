import {
  MAX_ANNOTATION_ORDER, MAX_COORDINATE, MAX_DOOR_BADGES, MAX_DRAWING_HOLES, MAX_DRAWING_POINTS, MAX_DRAWINGS, MAX_FONT_NAME, MAX_TEXT_LENGTH, MAX_TEXTS,
  type SharedAnnotations, type SharedDoor, type SharedDrawing, type SharedGrid, type SharedText,
} from '../protocol/index.ts';
import { annotationList, readDrawing } from '../../annotations/annotationList';
import type { DrawingAnnotation, TextAnnotation } from '../../annotations/annotationTypes';
import type { LiveDrawing } from '../../annotations/madeDrawing';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { GridOptions } from '../../grid/GridSystem';
import { subtractShapes } from '../../lighting/polygonClip';
import type { DrawingStroke, TextElement } from '../../types';
import { MAX_Q, Q_SCALE, type QShape } from '../../types/shapeTypes';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';
import { ringColour, roundPlace } from './scenePicture.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** A place players may be sent: finite and within the protocol's reach. */
const onMap = (value: unknown): value is number => finite(value) && Math.abs(value) <= MAX_COORDINATE;
const clamp = (value: number | undefined, min: number, max: number, fallback: number): number => (finite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const hex = (colour: number): string => `#${(colour & 0xffffff).toString(16).padStart(6, '0')}`;

/** A font family players are sent: the GM's, when it is only names, quotes, commas and spaces. */
const FONT = /^[\p{L}\p{N} ,'"_-]*$/u;
const FALLBACK_FONT = 'sans-serif';

/** The grid as the players' frame shows it: the GM's own grid, as the GM sets it; none while the GM hides it. */
export function sharedGrid(options: Readonly<GridOptions> | null): SharedGrid | null {
  if (options === null || options.enabled === false || !finite(options.size) || options.size < 1) return null;
  const numbers = options.cellNumbers;
  return {
    type: options.type ?? 'square',
    size: options.size,
    offsetX: clamp(options.offsetX, -1e6, 1e6, 0),
    offsetY: clamp(options.offsetY, -1e6, 1e6, 0),
    colour: finite(options.color) ? hex(options.color) : null,
    alpha: clamp(options.alpha, 0, 1, 0.7),
    lineWidth: clamp(options.lineWidth, 0, 100, 1),
    lineType: options.lineType ?? 'solid',
    numbers: numbers ? { format: numbers.format, opacity: clamp(numbers.opacity, 0, 1, 0.8) } : null,
  };
}

/**
 * The badges of the doors players see: each ordinary door's ends and whether it stands open; nothing
 * else of it. A secret door never has one for players, whatever `seen` says.
 */
export function sharedDoors(walls: Readonly<Record<string, WallSegment>>, seen: ReadonlySet<string>): SharedDoor[] {
  return wallList(walls).filter((wall) => wall.type === 'door' && seen.has(wall.id)).slice(0, MAX_DOOR_BADGES)
    .map((wall) => ({ p: [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y], open: !(wall.closed ?? true) }));
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

const toQ = (value: number): number => Math.max(-MAX_Q, Math.min(MAX_Q, Math.round(value * Q_SCALE)));

/** Whether committed fog covers all of a box (with a hole anywhere in it, it does not). */
function underFog(box: Box, fog: FogCoverage): boolean {
  if (fog.shape.length === 0) return false;
  const [x0, y0, x1, y1] = [toQ(box.minX), toQ(box.minY), toQ(box.maxX), toQ(box.maxY)];
  const rect: QShape = [[x0, y0, x1, y0, x1, y1, x0, y1]];
  return subtractShapes(rect, fog.shape).length === 0;
}

function boxOf(points: readonly { x: number; y: number }[], reach: number): Box | null {
  if (points.length === 0 || !points.every((point) => onMap(point.x) && onMap(point.y))) return null;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of points) {
    box.minX = Math.min(box.minX, x - reach);
    box.minY = Math.min(box.minY, y - reach);
    box.maxX = Math.max(box.maxX, x + reach);
    box.maxY = Math.max(box.maxY, y + reach);
  }
  return box;
}

/** A place in the one order of drawings and texts as it is sent, as a field to spread; none for 0, which is what a reader takes for none. */
function orderField(order: number): { order?: number } {
  const sent = clamp(order, -MAX_ANNOTATION_ORDER, MAX_ANNOTATION_ORDER, 0);
  return sent === 0 ? {} : { order: sent };
}

/** Degrees as they are sent: within one turn. */
const turnOf = (degrees: number): number => (finite(degrees) ? ((degrees % 360) + 360) % 360 : 0);

const flat = (points: readonly { x: number; y: number }[]): number[] => points.flatMap((point) => [point.x, point.y]);
const SHAPES = { pen: undefined, line: 'line', free: 'line', rectangle: 'rectangle', ellipse: 'ellipse' } as const;

/**
 * A drawing in the words the page reads: a stamp, or its line as a pen's stroke through its points,
 * whatever shape it is, which is what a page reads that knows nothing more. Beside the line goes
 * what it is drawn by: its shape, whether it is a curve, its fill and the holes in it, its dashes
 * and arrowheads, a stamp's turn, and its place in the one order. Nothing else of it: not who made
 * it, its group, its lock or its id, and of a curve's clicked points only that there were some.
 */
function sharedDrawing(drawing: DrawingAnnotation): SharedDrawing | null {
  const width = clamp(drawing.width, 0, 100_000, 4);
  const colour = ringColour(drawing.color);
  const { opacity, points } = drawing;
  if (drawing.shape === 'stamp') {
    const centre = points[0];
    if (centre === undefined || drawing.icon === null || !/^[a-z0-9-]{1,40}$/.test(drawing.icon)) return null;
    const turn = turnOf(drawing.rotation);
    return { type: 'icon', points: [centre.x, centre.y], colour, width, opacity, icon: drawing.icon, ...(turn !== 0 && { turn }), ...orderField(drawing.order) };
  }
  const shape = SHAPES[drawing.shape];
  // A hole that reaches past the protocol's reach is left out: the fill then covers it, which gives nothing away.
  const holes = drawing.holes.filter((ring) => ring.every((point) => onMap(point.x) && onMap(point.y))).slice(0, MAX_DRAWING_HOLES).map(flat);
  return {
    type: 'pen', points: flat(points), colour, width, opacity,
    ...(shape !== undefined && { shape }),
    ...(drawing.anchors !== null && { curved: true as const }),
    ...(drawing.fill !== null && { fill: drawing.fill }),
    ...(holes.length > 0 && { holes }),
    ...(drawing.dash !== null && { dash: drawing.dash }),
    ...(drawing.ends !== null && { ends: drawing.ends }),
    ...orderField(drawing.order),
  };
}

/** A box sure to hold a text however its font draws it: generous, so a text is never hidden that fog does not cover. */
function textBox(text: TextAnnotation): Box | null {
  if (!onMap(text.x) || !onMap(text.y)) return null;
  const typed = text.text.split('\n');
  const size = clamp(text.fontSize, 1, 10_000, 16);
  const padding = text.padding * 2;
  const longest = typed.reduce((most, line) => Math.max(most, line.length), 0);
  // A text with a width is no wider than it (or than one letter), and has a line more for every place it wraps at.
  const width = (text.width === null ? longest * size : Math.max(text.width, size)) + padding;
  const lines = typed.length + (text.width === null ? 0 : (text.breaks?.length ?? text.text.length));
  const height = lines * size * 1.5 + padding;
  const reach = (Math.hypot(width, height) / 2) * clamp(text.scale, 0.001, 1_000, 1);
  return { minX: text.x - reach, minY: text.y - reach, maxX: text.x + reach, maxY: text.y + reach };
}

function sharedText(text: TextAnnotation): SharedText {
  const font = text.fontFamily.slice(0, MAX_FONT_NAME);
  const words = text.text.slice(0, MAX_TEXT_LENGTH);
  const wrap = text.width === null ? undefined : clamp(text.width, Number.MIN_VALUE, 100_000, 0);
  // The places its lines break at go with the width they were measured for, and only those within the words sent.
  const breaks = wrap === undefined ? undefined : text.breaks?.filter((index) => index <= words.length);
  return {
    x: text.x, y: text.y, text: words, fontSize: clamp(text.fontSize, 1, 10_000, 16), fontFamily: FONT.test(font) ? font : FALLBACK_FONT,
    colour: ringColour(text.color), background: text.backgroundColor ? ringColour(text.backgroundColor) : null, padding: clamp(text.padding, 0, 10_000, 8),
    radius: clamp(text.borderRadius, 0, 10_000, 0), opacity: text.opacity, align: text.align, bold: text.bold, italic: text.italic,
    rotation: Math.abs(text.rotation) <= 360 ? text.rotation : turnOf(text.rotation), scale: clamp(text.scale, 0.001, 1_000, 1),
    ...(text.look === 'outline' && { outline: true as const }),
    ...(wrap !== undefined && wrap > 0 && { wrap }),
    ...(wrap !== undefined && wrap > 0 && breaks !== undefined && { breaks }),
    ...orderField(text.order),
  };
}

/** The points a drawing counts for among those a message may carry: its line's and its holes'. */
const pointsOf = (drawing: SharedDrawing): number => (drawing.points.length + (drawing.holes ?? []).reduce((sum, ring) => sum + ring.length, 0)) / 2;

/**
 * A drawing as players are told it, or null for one they are told nothing of: one the GM keeps to
 * themselves (`hidden`), one whose place is beyond the protocol's reach, and one committed fog
 * covers whole (the frame's fog hides it, so it is not sent). Fog that cannot be read covers
 * everything. The one rule for a drawing on the map and for one being made.
 */
function toldDrawing(drawing: DrawingAnnotation, fog: FogCoverage | null): SharedDrawing | null {
  if (drawing.hidden || fog === null) return null;
  const reached = drawing.shape === 'stamp' ? drawing.points.slice(0, 1) : drawing.points;
  const box = boxOf(reached, Math.max(1, clamp(drawing.width, 0, 100_000, 4) / 2));
  return box === null || underFog(box, fog) ? null : sharedDrawing(drawing);
}

/** The ids the GM's scene has for the drawings and texts players are told, as the message lists those above the tokens. */
export interface ToldAbove {
  readonly drawings: readonly string[];
  readonly texts: readonly string[];
}

/** What players are told of drawings and texts, and which of the scene's each entry above the tokens is. */
export interface ToldAnnotationLists {
  readonly shared: SharedAnnotations;
  readonly above: ToldAbove;
}

/**
 * The drawings and texts players see, read as everything reads them (`annotationList`), in its
 * order: without those the GM keeps to themselves (`hidden`) and without those committed fog
 * covers whole (the frame's fog hides them, so they are not sent). Fog that cannot be read covers
 * everything; nothing is sent then.
 *
 * Those above the tokens are told as the players' frame draws them, above the lighting. Those on
 * the map are told apart (`onMap`): they lie under the lighting, and a page that drew them above
 * it would show them over rooms nobody has seen, so a page that does not know the field shows
 * none of them. Both together stay within what one message may carry.
 *
 * `above` names each told entry above the tokens by its id in the GM's scene, in the lists'
 * order: it never leaves the GM, and says which entries a player is told are theirs.
 */
export function toldAnnotationLists(
  drawings: Readonly<Record<string, DrawingStroke>>,
  texts: Readonly<Record<string, TextElement>>,
  fog: FogCoverage | null,
): ToldAnnotationLists {
  if (fog === null) return { shared: { drawings: [], texts: [] }, above: { drawings: [], texts: [] } };
  const above = { drawings: [] as SharedDrawing[], texts: [] as SharedText[] };
  const onMap = { drawings: [] as SharedDrawing[], texts: [] as SharedText[] };
  const ids = { drawings: [] as string[], texts: [] as string[] };
  const room = { drawings: MAX_DRAWINGS, texts: MAX_TEXTS, points: MAX_DRAWING_POINTS };
  for (const annotation of annotationList({ drawings, texts })) {
    if (annotation.hidden) continue;
    const lists = annotation.layer === 'map' ? onMap : above;
    if (annotation.kind === 'text') {
      if (room.texts === 0) continue;
      const box = textBox(annotation);
      if (box === null || underFog(box, fog)) continue;
      room.texts -= 1;
      lists.texts.push(sharedText(annotation));
      if (lists === above) ids.texts.push(annotation.id);
      continue;
    }
    if (room.drawings === 0) continue;
    const shared = toldDrawing(annotation, fog);
    if (shared === null || pointsOf(shared) > room.points) continue;
    room.points -= pointsOf(shared);
    room.drawings -= 1;
    lists.drawings.push(shared);
    if (lists === above) ids.drawings.push(annotation.id);
  }
  return { shared: onMap.drawings.length + onMap.texts.length > 0 ? { ...above, onMap } : above, above: ids };
}

/** The drawings and texts players see (`toldAnnotationLists`). */
export function sharedAnnotations(
  drawings: Readonly<Record<string, DrawingStroke>>,
  texts: Readonly<Record<string, TextElement>>,
  fog: FogCoverage | null,
): SharedAnnotations {
  return toldAnnotationLists(drawings, texts, fog).shared;
}

/**
 * A drawing that is being made, as players are told it while it grows: by the rule a finished one
 * is told by (`toldDrawing`), its places to a hundredth of a pixel. Null for one they are told
 * nothing of until it is made: one on the map, which lies under the lighting and shows only where
 * the map does once it is there, and one no finished drawing would be told of.
 */
export function sharedLiveDrawing(live: LiveDrawing, fog: FogCoverage | null): SharedDrawing | null {
  const drawing = readDrawing('live', { id: 'live', kind: 'drawing', timestamp: 0, ...live });
  if (drawing === null || drawing.shape === 'stamp' || drawing.layer !== 'above') return null;
  const told = toldDrawing(drawing, fog);
  if (told === null) return null;
  return { ...told, points: told.points.map(roundPlace), ...(told.holes !== undefined && { holes: told.holes.map((ring) => ring.map(roundPlace)) }) };
}
