import { MAX_OWN_ANCHOR_NUMBERS, MAX_PLAYER_STROKE_POINTS, type PlayerDrawChange } from '../protocol/index.ts';
import { readDrawing, readText } from '../../annotations/annotationList';
import type { Annotation, AnnotationPlace, DrawingAnnotation, DrawingInput } from '../../annotations/annotationTypes';
import type { StyleWrite } from '../../packages/components/toolbar/drawStyle';
import { changeDrawing, changeText } from '../../stores/annotationWrites';
import type { DrawingStroke, TextElement } from '../../types';
import type { SceneState } from './atlasView.ts';
import { allNearEdge, drawingPoints, nearEdge, playerUse, textHeightAllowed, type PlayerUse } from './drawCheck.ts';
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

/** `annotations` as they read with `places` written to them; null where one would be no annotation any more. */
export function placedAnnotations(annotations: readonly Annotation[], places: Readonly<Record<string, AnnotationPlace>>): Annotation[] | null {
  const after: Annotation[] = [];
  for (const annotation of annotations) {
    const place = places[annotation.id];
    if (!place) {
      after.push(annotation);
      continue;
    }
    const record = { ...annotation.record, ...place };
    const read = annotation.kind === 'text' ? readText(annotation.id, record) : readDrawing(annotation.id, record);
    if (!read) return null;
    after.push(read);
  }
  return after;
}

/** Whether a changed annotation lies where a player's may and, a text, is of a size one may have. */
export function placeAllowed(annotation: Annotation, map: MapSize | null, cell: number): boolean {
  if (annotation.kind === 'text') return nearEdge(annotation, map, cell) && textHeightAllowed(annotation.fontSize * annotation.scale, cell);
  return annotation.points.length <= MAX_PLAYER_STROKE_POINTS && allNearEdge(annotation.points, map, cell);
}

/** What `player` has once `before` (theirs) read as `after`. */
export function useAfter(list: readonly Annotation[], player: string, before: readonly Annotation[], after: readonly Annotation[]): PlayerUse {
  const use = playerUse(list, player);
  const points = (annotations: readonly Annotation[]): number => annotations.reduce((sum, annotation) => sum + (annotation.kind === 'drawing' ? drawingPoints(annotation) : 0), 0);
  use.points += points(after) - points(before);
  return use;
}

/** What a player has once a sweep took `removed` of their drawings and left `added`. */
export function erasedUse(use: PlayerUse, own: readonly Annotation[], removed: readonly string[], added: readonly DrawingInput[]): PlayerUse {
  const gone = new Set(removed);
  const taken = own.filter((annotation): annotation is DrawingAnnotation => annotation.kind === 'drawing' && gone.has(annotation.id));
  return {
    drawings: use.drawings - taken.length + added.length,
    points: use.points - taken.reduce((sum, drawing) => sum + drawingPoints(drawing), 0) + added.reduce((sum, piece) => sum + drawingPoints(piece), 0),
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
