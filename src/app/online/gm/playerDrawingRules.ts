import { MAX_OWN_ANCHOR_NUMBERS, type PlayerDrawChange } from '../protocol/index.ts';
import { readDrawing, readText } from '../../annotations/annotationList';
import { levelObjects } from '../../levels/levelObjects';
import type { Annotation, AnnotationPlace, DrawingAnnotation, DrawingInput } from '../../annotations/annotationTypes';
import type { StyleWrite } from '../../packages/components/toolbar/drawStyle';
import { changeDrawing, changeText } from '../../stores/annotationWrites';
import type { DrawingStroke, TextElement } from '../../types';
import type { SceneState } from './atlasView.ts';
import { seeThroughWeight } from './drawCost.ts';
import { allNearEdge, costAllowed, drawingPoints, fillAllowed, nearEdge, playerUse, textHeightAllowed, type PlayerUse } from './drawCheck.ts';
import type { MapSize } from './moveCheck.ts';

/**
 * What `PlayerDrawings` decides and writes by, as functions of what the scene holds: which
 * drawings and texts are a player's to change, what a change may write, and what a player has
 * once it is written.
 */

/** What a player's own drawing or text may be changed in by a pick of the bars: never who sees it, where it lies, its lock, its group or its order. */
export const DRAWING_STYLE_FIELDS = ['color', 'width', 'opacity', 'fill', 'dash', 'ends'] as const;
export const TEXT_STYLE_FIELDS = ['color', 'fontSize', 'scale', 'fontFamily', 'align', 'bold', 'italic', 'breaks'] as const;
export const TEXT_LOOK_FIELDS = ['backgroundColor', 'padding', 'borderRadius', 'opacity', 'outline'] as const;
export const DRAWING_PLACE_FIELDS = ['points', 'anchors', 'holes'] as const;
export const TEXT_PLACE_FIELDS = ['x', 'y', 'rotation', 'scale'] as const;

/** The points a curve of a player's own was clicked with, as its maker is told them; none for any other drawing, and for more than a message tells. */
export function ownAnchors(record: DrawingStroke | TextElement | undefined): { anchors?: number[] } {
  const anchors: unknown = record?.kind === 'drawing' ? record.anchors : undefined;
  if (!Array.isArray(anchors) || anchors.length < 2 || anchors.length * 2 > MAX_OWN_ANCHOR_NUMBERS) return {};
  const flat: number[] = [];
  for (const point of anchors as unknown[]) {
    if (typeof point !== 'object' || point === null) return {};
    const { x, y } = point as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return {};
    flat.push(x, y);
  }
  return { anchors: flat };
}

/** The fields a text told anew is written in. */
export const WORDS_FIELDS = ['x', 'y', 'text', 'width', 'breaks'] as const;

/**
 * Whether a drawing or text is `player`'s to change: they made it, players are shown it, it lies
 * above the tokens and it is not locked. What the GM hid, laid on the map or locked is the GM's
 * to change alone, and the player is told no id for it.
 */
export function isOwn(record: unknown, player: string): boolean {
  if (typeof record !== 'object' || record === null) return false;
  const { by, hidden, layer, locked } = record as { by?: unknown; hidden?: unknown; layer?: unknown; locked?: unknown };
  return by === player && hidden !== true && layer !== 'map' && locked !== true;
}

/**
 * The annotations a player names by the ids they were told (`idOf`), where every one of them is
 * theirs to change; null where any is not, is gone, or is named by an id they were never told.
 */
export function namedOwn(idOf: (alias: string) => string | undefined, player: string, aliases: readonly string[], state: SceneState): Annotation[] | null {
  const { drawings, texts } = levelObjects(state);
  const own: Annotation[] = [];
  for (const alias of aliases) {
    const id = idOf(alias);
    if (id === undefined) return null;
    const record = drawings[id] ?? texts[id];
    const annotation = !isOwn(record, player) ? null : drawings[id] ? readDrawing(id, record) : readText(id, record);
    if (!annotation) return null;
    own.push(annotation);
  }
  return own.length > 0 ? own : null;
}

/** A text told anew as a place; null for anything but a text, a width no letter fits in or the map does not hold, or breaks beyond its words. */
export function wordsPlace(annotation: Annotation | undefined, words: Extract<PlayerDrawChange, { words: unknown }>['words'], widest: number): AnnotationPlace & { text?: string } | null {
  if (annotation?.kind !== 'text') return null;
  const { x, y, text, wrap, breaks } = words;
  if (wrap !== undefined && (wrap < annotation.fontSize || wrap > widest)) return null;
  const length = (text ?? annotation.text).length;
  if (breaks !== undefined && (breaks.some((index) => index > length) || (wrap === undefined && annotation.width === null))) return null;
  // Words or a width without the places their lines break at: the breaks they had say nothing of them, and go.
  const reset = breaks === undefined && (text !== undefined || wrap !== undefined);
  return { x, y, ...(text !== undefined && { text }), ...(wrap !== undefined && { width: wrap }), ...(breaks !== undefined ? { breaks: [...breaks] } : reset && { breaks: undefined }) };
}

/**
 * `annotations` as they read once a change is written to them: `places`, and what the picks of
 * the bars write (`writes`), each by the fields a player's change may write and by the very
 * functions the store's write goes by, so what is judged is what is then written. `words`: the
 * place is a text told anew. Null where one would be no annotation any more.
 */
export function changedAnnotations(annotations: readonly Annotation[], places: Readonly<Record<string, AnnotationPlace>>, writes: readonly StyleWrite[], words: boolean): Annotation[] | null {
  const after: Annotation[] = [];
  for (const annotation of annotations) {
    const { id } = annotation;
    const place = places[id];
    const picks = writes.filter((write): write is Exclude<StyleWrite, { kind: 'place' }> => write.kind !== 'place' && write.ids.includes(id));
    if (!place && picks.length === 0) {
      after.push(annotation);
      continue;
    }
    let read: Annotation | null;
    if (annotation.kind === 'drawing') {
      const record: DrawingStroke = { ...annotation.record };
      if (place) changeDrawing(record, place, DRAWING_PLACE_FIELDS);
      for (const pick of picks) if (pick.kind === 'update') changeDrawing(record, pick.changes, DRAWING_STYLE_FIELDS);
      read = readDrawing(id, record);
    } else {
      const record: TextElement = { ...annotation.record };
      if (place) changeText(record, place, words ? WORDS_FIELDS : TEXT_PLACE_FIELDS);
      for (const pick of picks) changeText(record, pick.changes, pick.kind === 'text' ? TEXT_LOOK_FIELDS : TEXT_STYLE_FIELDS);
      read = readText(id, record);
    }
    if (!read) return null;
    after.push(read);
  }
  return after;
}

/**
 * Whether drawings changed from `before` to `after` (one for one) are still what a player's may
 * be: none costs more than one may (`costAllowed`), and a fill is one a player may make
 * (`fillAllowed`) wherever the change gave a drawing its fill or, with `remade`, set its points
 * anew. A fill that was there and was only moved, scaled or coloured is as it was.
 */
export function shapesAllowed(before: readonly Annotation[], after: readonly Annotation[], remade: boolean): boolean {
  return after.every((annotation, index) => {
    if (annotation.kind !== 'drawing') return true;
    const was = before[index];
    const filledAnew = was?.kind === 'drawing' && was.fill === null;
    return costAllowed(annotation) && (!(remade || filledAnew) || fillAllowed(annotation));
  });
}

/** Whether a changed annotation lies where a player's may and, a text, is of a size one may have. */
export function placeAllowed(annotation: Annotation, map: MapSize | null, cell: number): boolean {
  if (annotation.kind === 'text') return nearEdge(annotation, map, cell) && textHeightAllowed(annotation.fontSize * annotation.scale, cell);
  return allNearEdge(annotation.points, map, cell);
}

/** What `player` has once `before` (theirs) read as `after`. */
export function useAfter(list: readonly Annotation[], player: string, before: readonly Annotation[], after: readonly Annotation[]): PlayerUse {
  const use = playerUse(list, player);
  const sum = (annotations: readonly Annotation[], of: (drawing: DrawingAnnotation) => number): number => annotations.reduce((total, annotation) => total + (annotation.kind === 'drawing' ? of(annotation) : 0), 0);
  use.points += sum(after, drawingPoints) - sum(before, drawingPoints);
  use.seeThrough += sum(after, seeThroughWeight) - sum(before, seeThroughWeight);
  return use;
}

/** What a player has once a sweep took `removed` of their drawings and left `added`. Their see-through ink counts as it did: a cut leaves no more of it than there was. */
export function erasedUse(use: PlayerUse, own: readonly Annotation[], removed: readonly string[], added: readonly DrawingInput[]): PlayerUse {
  const gone = new Set(removed);
  const taken = own.filter((annotation): annotation is DrawingAnnotation => annotation.kind === 'drawing' && gone.has(annotation.id));
  return {
    drawings: use.drawings - taken.length + added.length,
    points: use.points - taken.reduce((sum, drawing) => sum + drawingPoints(drawing), 0) + added.reduce((sum, piece) => sum + drawingPoints(piece), 0),
    seeThrough: use.seeThrough,
    texts: use.texts,
  };
}

/** Writes one write of a pick to the drawings and texts it names, in the fields a pick may change. */
export function applyStyle(draft: SceneState, write: StyleWrite): void {
  if (write.kind === 'place') return;
  for (const id of write.ids) {
    const drawing = draft.objects.drawings[id];
    const text = draft.objects.texts[id];
    if (write.kind === 'text') {
      if (text) changeText(text, write.changes, TEXT_LOOK_FIELDS);
      continue;
    }
    if (drawing) changeDrawing(drawing, write.changes, DRAWING_STYLE_FIELDS);
    if (text) changeText(text, write.changes, TEXT_STYLE_FIELDS);
  }
}

/** Removes drawings and texts by id, and from the selection where the store has one. */
export function removeFrom(draft: SceneState & { selectedIds?: string[] }, ids: ReadonlySet<string>): void {
  for (const id of ids) {
    delete draft.objects.drawings[id];
    delete draft.objects.texts[id];
  }
  if (draft.selectedIds?.some((id) => ids.has(id))) draft.selectedIds = draft.selectedIds.filter((id) => !ids.has(id));
}
