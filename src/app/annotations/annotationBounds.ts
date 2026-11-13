/**
 * Where an annotation is: the box that holds all of it, for the index and for leaving out what
 * is off screen, and the turned box a text or a stamp fills, which is what takes its presses.
 */

import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import type { Annotation, DrawingAnnotation, TextAnnotation } from './annotationTypes';
import { arrowReach } from './strokeLook';

/**
 * The size of a text as it is drawn, before its scale and turn, world pixels: its words and, where
 * it has one, its plate. Whoever draws texts knows it and hands it in; without it the size is
 * guessed from the letters, which is good enough to find a text and too rough to frame one.
 */
export type TextMeasure = (text: TextAnnotation) => { readonly width: number; readonly height: number };

/** A box turned about its centre: half its width and height, and the cosine and sine of its turn (clockwise on screen). */
export interface TurnedBox {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly cos: number;
  readonly sin: number;
}

/** A letter's width and a line's height as shares of the font size, for a text nobody measured. */
const GUESSED_LETTER = 0.6;
const GUESSED_LINE = 1.2;

function guessedSize(text: TextAnnotation): { width: number; height: number } {
  const lines = text.text.split('\n');
  const letter = text.fontSize * GUESSED_LETTER;
  const widest = lines.reduce((most, line) => Math.max(most, line.length), 1) * letter;
  const wrap = text.width;
  // A text with a wrap width breaks each of its lines into as many as its letters need.
  const rows = wrap === null ? lines.length : lines.reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * letter) / Math.max(letter, wrap))), 0);
  const plate = text.look === 'plate' ? 2 * text.padding : 0;
  return { width: (wrap ?? widest) + plate, height: rows * text.fontSize * GUESSED_LINE + plate };
}

function turned(x: number, y: number, halfWidth: number, halfHeight: number, degrees: number): TurnedBox {
  const angle = (degrees * Math.PI) / 180;
  return { x, y, halfWidth, halfHeight, cos: degrees ? Math.cos(angle) : 1, sin: degrees ? Math.sin(angle) : 0 };
}

/** The box a text fills on the map. */
export function textBox(text: TextAnnotation, measure?: TextMeasure): TurnedBox {
  const size = measure ? measure(text) : guessedSize(text);
  return turned(text.x, text.y, (size.width * text.scale) / 2, (size.height * text.scale) / 2, text.rotation);
}

/** The box a stamp fills: its footprint about its centre, turned as the stamp is. */
export function stampBox(stamp: DrawingAnnotation): TurnedBox {
  const centre = stamp.points[0]!;
  return turned(centre.x, centre.y, stamp.width / 2, stamp.width / 2, stamp.rotation);
}

/** Whether `point` lies in `box`, or no farther than `tolerance` from it. */
export function inTurnedBox(point: Point, box: TurnedBox, tolerance = 0): boolean {
  const x = point.x - box.x;
  const y = point.y - box.y;
  const beyondX = Math.max(0, Math.abs(x * box.cos + y * box.sin) - box.halfWidth);
  const beyondY = Math.max(0, Math.abs(y * box.cos - x * box.sin) - box.halfHeight);
  return beyondX * beyondX + beyondY * beyondY <= tolerance * tolerance;
}

/** The corners of `box`, and the first again: its outline as a line. */
export function boxOutline(box: TurnedBox): Point[] {
  const corner = (sideX: number, sideY: number): Point => ({
    x: box.x + sideX * box.halfWidth * box.cos - sideY * box.halfHeight * box.sin,
    y: box.y + sideX * box.halfWidth * box.sin + sideY * box.halfHeight * box.cos,
  });
  const first = corner(-1, -1);
  return [first, corner(1, -1), corner(1, 1), corner(-1, 1), { x: first.x, y: first.y }];
}

function boundsOfBox(box: TurnedBox): Box {
  const reachX = Math.abs(box.halfWidth * box.cos) + Math.abs(box.halfHeight * box.sin);
  const reachY = Math.abs(box.halfWidth * box.sin) + Math.abs(box.halfHeight * box.cos);
  return { minX: box.x - reachX, minY: box.y - reachY, maxX: box.x + reachX, maxY: box.y + reachY };
}

const drawingBounds = new WeakMap<DrawingAnnotation, Box>();

function boundsOfDrawing(drawing: DrawingAnnotation): Box {
  if (drawing.shape === 'stamp') return boundsOfBox(stampBox(drawing));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of drawing.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // A line's ink stands half its width out from its points, its arrowheads' barbs farther.
  const reach = drawing.ends ? Math.max(drawing.width / 2, arrowReach(drawing.width)) : drawing.width / 2;
  return { minX: minX - reach, minY: minY - reach, maxX: maxX + reach, maxY: maxY + reach };
}

/**
 * The box around everything `annotation` shows: a line with its width and arrowheads, a stamp's or
 * a text's turned box. A drawing's is worked out once (a read drawing never changes); a text's
 * every time, since its size is the measurer's to say.
 */
export function annotationBounds(annotation: Annotation, measure?: TextMeasure): Box {
  if (annotation.kind === 'text') return boundsOfBox(textBox(annotation, measure));
  let bounds = drawingBounds.get(annotation);
  if (!bounds) {
    bounds = boundsOfDrawing(annotation);
    drawingBounds.set(annotation, bounds);
  }
  return bounds;
}
