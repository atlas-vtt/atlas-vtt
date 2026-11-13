/**
 * Told drawings and texts as the records a map holds them in, so whoever is told them reads and
 * draws them by the rules their teller's own map goes by (`annotationList`, `AnnotationLayer`).
 */

import type { SharedAnnotationLists, SharedAnnotations, SharedDrawing, SharedText } from '../protocol/index.ts';
import type { AnnotationRecords } from '../../annotations/annotationList';
import type { LiveDrawing } from '../../annotations/madeDrawing';
import type { DrawingStroke, TextElement } from '../../types';

type Point = DrawingStroke['points'][number];
type DrawingFields = Omit<DrawingStroke, 'id' | 'kind' | 'timestamp'>;

const TYPES = { line: 'line', rectangle: 'rectangle', ellipse: 'circle' } as const;

function pointsOf(flat: readonly number[]): Point[] {
  const points: Point[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) points.push({ x: flat[index]!, y: flat[index + 1]! });
  return points;
}

/**
 * A told drawing's fields as a record has them. `asMade`: its teller says what a drawing is
 * beside its line; false for one that tells every stroke as a pen's and draws it as the line
 * through its points, which is how it is then read.
 */
function drawingFields(told: SharedDrawing, asMade: boolean): DrawingFields {
  const points = pointsOf(told.points);
  const common = { points, color: told.colour, width: told.width, opacity: told.opacity, ...(told.order !== undefined && { order: told.order }) };
  if (told.type === 'icon') return { ...common, type: 'icon', ...(told.icon !== undefined && { icon: told.icon }), ...(told.turn !== undefined && { rotation: told.turn }) };
  const first = points[0];
  const last = points[points.length - 1];
  const closed = points.length >= 4 && first !== undefined && last !== undefined && first.x === last.x && first.y === last.y;
  // A curve is told without the points it was clicked with; two of its own stand for them, which is all a reader needs to round it.
  const anchors = told.curved === true && first !== undefined && last !== undefined && points.length >= 2 ? [first, closed ? points[1]! : last] : undefined;
  return {
    ...common,
    type: told.shape === undefined ? (asMade ? 'pen' : 'line') : TYPES[told.shape],
    ...(told.fill !== undefined && { fill: told.fill }),
    ...(told.holes !== undefined && { holes: told.holes.map(pointsOf) }),
    ...(told.dash !== undefined && { dash: told.dash }),
    ...(told.ends !== undefined && { ends: told.ends }),
    ...(anchors !== undefined && (told.shape === undefined || told.shape === 'line') && { type: 'line' as const, anchors }),
  };
}

function textFields(told: SharedText): Omit<TextElement, 'id' | 'kind'> {
  return {
    x: told.x, y: told.y, text: told.text, fontSize: told.fontSize, fontFamily: told.fontFamily, color: told.colour,
    ...(told.background !== null && { backgroundColor: told.background }), padding: told.padding, borderRadius: told.radius, opacity: told.opacity,
    align: told.align, bold: told.bold, italic: told.italic, rotation: told.rotation, scale: told.scale,
    ...(told.outline === true && { outline: true as const }),
    ...(told.wrap !== undefined && { width: told.wrap }),
    ...(told.breaks !== undefined && { breaks: [...told.breaks] }),
    ...(told.order !== undefined && { order: told.order }),
  };
}

/** A told drawing under way as the drawing a gesture shows while it lasts (`LiveStroke`). */
export function liveDrawingOf(told: SharedDrawing): LiveDrawing {
  return drawingFields(told, true);
}

type Kept<Record> = Map<string, Record>;

/**
 * The records of the drawings and texts a teller's messages tell. An entry that says what one of
 * the message before said keeps its record, so whoever draws from the records draws nothing anew
 * for it. Ids are made here: a teller names none.
 */
export class ToldAnnotations {
  private drawings: Kept<DrawingStroke> = new Map();
  private texts: Kept<TextElement> = new Map();
  private count = 0;

  /**
   * The records of everything `told` tells: those above the tokens and, marked `layer: 'map'`,
   * those on the map, each list in its order. `asMade` as for `drawingFields`.
   */
  read(told: SharedAnnotations, asMade: boolean): Required<AnnotationRecords> {
    const drawings: Kept<DrawingStroke> = new Map();
    const texts: Kept<TextElement> = new Map();
    const take = (lists: SharedAnnotationLists, onMap: boolean): void => {
      const place = onMap ? { layer: 'map' as const } : {};
      const prefix = `${onMap ? 'm' : 'a'}${asMade ? '' : 'o'}`;
      for (const entry of lists.texts) {
        const key = free(texts, prefix + JSON.stringify(entry));
        texts.set(key, this.texts.get(key) ?? { id: this.id('t'), kind: 'text', ...textFields(entry), ...place });
      }
      for (const entry of lists.drawings) {
        const key = free(drawings, prefix + JSON.stringify(entry));
        drawings.set(key, this.drawings.get(key) ?? { id: this.id('d'), kind: 'drawing', timestamp: 0, ...drawingFields(entry, asMade), ...place });
      }
    };
    take(told, false);
    if (told.onMap) take(told.onMap, true);
    this.drawings = drawings;
    this.texts = texts;
    return { drawings: byId(drawings.values()), texts: byId(texts.values()) };
  }

  /** Forgets every record: what is told next is all new. */
  clear(): void {
    this.drawings = new Map();
    this.texts = new Map();
  }

  private id(prefix: string): string {
    this.count += 1;
    return `${prefix}${this.count}`;
  }
}

/** `key`, or `key` with a count behind it where a list says the same thing more than once: each stays an entry of its own. */
function free(taken: ReadonlyMap<string, unknown>, key: string): string {
  if (!taken.has(key)) return key;
  let again = 2;
  while (taken.has(`${key}#${again}`)) again += 1;
  return `${key}#${again}`;
}

function byId<Record extends { id: string }>(records: Iterable<Record>): { [id: string]: Record } {
  const byId: { [id: string]: Record } = {};
  for (const record of records) byId[record.id] = record;
  return byId;
}
