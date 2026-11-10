import {
  MAX_COORDINATE, MAX_DOOR_BADGES, MAX_DRAWING_POINTS, MAX_DRAWINGS, MAX_FONT_NAME, MAX_TEXT_LENGTH, MAX_TEXTS,
  type SharedAnnotations, type SharedDoor, type SharedDrawing, type SharedGrid, type SharedText,
} from '../protocol/index.ts';
import type { FogCoverage } from '../../fog/fogCoverage';
import type { GridOptions } from '../../grid/GridSystem';
import { subtractShapes } from '../../lighting/polygonClip';
import type { DrawingStroke, TextElement } from '../../types';
import { MAX_Q, Q_SCALE, type QShape } from '../../types/shapeTypes';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';
import { ringColour } from './scenePicture.ts';

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

function sharedDrawing(stroke: DrawingStroke): SharedDrawing | null {
  const width = clamp(stroke.width, 0, 100_000, 4);
  if (!Array.isArray(stroke.points)) return null;
  const opacity = clamp(stroke.opacity, 0, 1, 1);
  const colour = ringColour(stroke.color);
  if (stroke.type === 'icon') {
    const centre = stroke.points[0];
    if (centre === undefined || typeof stroke.icon !== 'string' || !/^[a-z0-9-]{1,40}$/.test(stroke.icon)) return null;
    return { type: 'icon', points: [centre.x, centre.y], colour, width, opacity, icon: stroke.icon };
  }
  return { type: 'pen', points: stroke.points.flatMap((point) => [point.x, point.y]), colour, width, opacity };
}

/** A box sure to hold a text however its font draws it: generous, so a text is never hidden that fog does not cover. */
function textBox(text: TextElement): Box | null {
  if (!onMap(text.x) || !onMap(text.y) || typeof text.text !== 'string') return null;
  const lines = text.text.split('\n');
  const size = clamp(text.fontSize, 1, 10_000, 16);
  const padding = (text.padding || 8) * 2;
  const width = lines.reduce((longest, line) => Math.max(longest, line.length), 0) * size + padding;
  const height = lines.length * size * 1.5 + padding;
  const reach = (Math.hypot(width, height) / 2) * clamp(text.scale, 0.001, 1_000, 1);
  return { minX: text.x - reach, minY: text.y - reach, maxX: text.x + reach, maxY: text.y + reach };
}

function sharedText(text: TextElement): SharedText {
  const font = typeof text.fontFamily === 'string' ? text.fontFamily.slice(0, MAX_FONT_NAME) : FALLBACK_FONT;
  return {
    x: text.x, y: text.y, text: text.text.slice(0, MAX_TEXT_LENGTH), fontSize: clamp(text.fontSize, 1, 10_000, 16), fontFamily: FONT.test(font) ? font : FALLBACK_FONT,
    colour: ringColour(text.color), background: text.backgroundColor ? ringColour(text.backgroundColor) : null, padding: clamp(text.padding || 8, 0, 10_000, 8),
    radius: clamp(text.borderRadius, 0, 10_000, 0), opacity: clamp(text.opacity || 1, 0, 1, 1), align: text.align === 'left' || text.align === 'right' ? text.align : 'center', bold: text.bold === true, italic: text.italic === true,
    rotation: clamp(text.rotation, -360, 360, 0), scale: clamp(text.scale || 1, 0.001, 1_000, 1),
  };
}

/**
 * The drawings and texts players see: all of them, as the players' frame draws them above the
 * lighting, but those committed fog covers whole (the frame's fog hides them, so they are not
 * sent). Fog that cannot be read covers everything; nothing is sent then.
 */
export function sharedAnnotations(
  drawings: Readonly<Record<string, DrawingStroke>>,
  texts: Readonly<Record<string, TextElement>>,
  fog: FogCoverage | null,
): SharedAnnotations {
  if (fog === null) return { drawings: [], texts: [] };
  const shownDrawings: SharedDrawing[] = [];
  let points = 0;
  for (const stroke of Object.values(drawings)) {
    if (!Array.isArray(stroke.points)) continue;
    const centre = stroke.type === 'icon' ? stroke.points.slice(0, 1) : stroke.points;
    const box = boxOf(centre, Math.max(1, clamp(stroke.width, 0, 100_000, 4) / 2));
    if (box === null || underFog(box, fog)) continue;
    const shared = sharedDrawing(stroke);
    if (shared === null || points + shared.points.length / 2 > MAX_DRAWING_POINTS) continue;
    points += shared.points.length / 2;
    shownDrawings.push(shared);
    if (shownDrawings.length === MAX_DRAWINGS) break;
  }
  const shownTexts: SharedText[] = [];
  for (const text of Object.values(texts)) {
    const box = textBox(text);
    if (box === null || underFog(box, fog)) continue;
    shownTexts.push(sharedText(text));
    if (shownTexts.length === MAX_TEXTS) break;
  }
  return { drawings: shownDrawings, texts: shownTexts };
}
