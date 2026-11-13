/**
 * Drawings and texts (annotations) in the view store: scene objects, each action one store write
 * and so one undo step. A gesture that makes several wraps them in a history transaction.
 *
 * A locked drawing or text takes none of these changes but its unlocking (`annotationLock.ts`):
 * the actions leave it as it is and change the others they are handed. Only `clearAnnotations`
 * removes it.
 */

import { changesTaken, isLocked, unlockedIds } from '../annotations/annotationLock';
import { annotationStack, orderOnTop, reordered, type StackedAnnotation } from '../annotations/annotationStack';
import {
  DRAWING_FIELDS, TEXT_FIELDS, TEXT_FIELDS_BESIDE_DRAWINGS,
  type AnnotationChanges, type AnnotationPlace, type ClearScope, type DrawingInput, type TextChanges, type TextInput,
} from '../annotations/annotationTypes';
import { placedOnViewedLevel } from '../levels/sceneLevels';
import type { DrawingStroke, TextElement } from '../types';
import { changeDrawing, changeText, newAnnotationId, newDrawing, removeAnnotations, shiftDrawing, type AnnotationsDraft } from './annotationWrites';

export interface AnnotationsSlice {
  /** Adds a text on the level shown, above every annotation there unless its data names an `order`, and returns its id. */
  addText: (data: TextInput) => string;
  /** Changes a text: every field of a text the changes name, a field given as undefined being removed. Nothing of a locked one. */
  updateText: (id: string, changes: TextChanges) => void;
  setTexts: (texts: Record<string, TextElement>) => void;

  /** Adds a drawing on the level shown, above every annotation there unless its data names an `order`, and returns its id. */
  addDrawing: (data: DrawingInput) => string;
  /** Adds several drawings in one write, each above the one before, and returns their ids. */
  addDrawings: (data: readonly DrawingInput[]) => string[];
  setDrawings: (drawings: Record<string, DrawingStroke>) => void;

  /**
   * Changes drawings and texts in one write. A field only one kind has is written to that kind
   * alone, and `width` and `opacity` to drawings alone (`AnnotationChanges`); a field given as
   * undefined is removed, unless no drawing or text can be without it. A locked one takes only
   * `locked: undefined`.
   */
  updateAnnotations: (ids: readonly string[], changes: AnnotationChanges) => void;
  /** Moves drawings and texts by (dx, dy) in one write; a locked one stays. */
  moveAnnotations: (ids: readonly string[], dx: number, dy: number) => void;
  /** Gives each listed annotation the place named for it (a group turned or scaled as one), in one write; a field given as undefined is removed. A locked one keeps its place. */
  placeAnnotations: (places: Readonly<Record<string, AnnotationPlace>>) => void;
  /** Removes drawings and texts in one write; other ids stay selected, and so does a locked one, which stays. */
  deleteAnnotations: (ids: readonly string[]) => void;
  /**
   * Puts annotations of the level shown above (`front`) or below (`back`) every other one there,
   * keeping the order they have among themselves; nothing where they already lie so. A locked one
   * is not among them.
   */
  orderAnnotations: (ids: readonly string[], to: 'front' | 'back') => void;
  /**
   * Removes drawings and adds others in one write: the eraser's cut. What is added keeps every
   * field it is handed, its `order` too (a piece lies where its drawing lay), and returns its ids.
   * Nothing where one to remove is locked: its pieces would lie beside it.
   */
  replaceDrawings: (removedIds: readonly string[], added: readonly DrawingInput[]) => string[];
  /**
   * Removes annotations of the level shown in one write: those above the tokens, all of them, or
   * those online players made, locked ones too. Other levels keep theirs.
   */
  clearAnnotations: (scope: ClearScope) => void;
}

type ImmerSet = (fn: (draft: AnnotationsDraft) => void) => void;

/** What `clearAnnotations` takes of the level shown, for each scope. */
const CLEARED: Readonly<Record<ClearScope, (entry: StackedAnnotation['entry']) => boolean>> = {
  above: (entry) => entry.layer !== 'map',
  level: () => true,
  players: (entry) => typeof entry.by === 'string' && entry.by !== '',
};

export function createAnnotationsActions(set: ImmerSet, get: () => AnnotationsDraft): AnnotationsSlice {
  return {
    addText: (data) => {
      const id = newAnnotationId('text');
      const order = data.order ?? orderOnTop(get());
      set((draft) => {
        draft.objects.texts[id] = { id, kind: 'text', ...data, order, ...placedOnViewedLevel(draft) };
      });
      return id;
    },

    updateText: (id, changes) => set((draft) => {
      const text = draft.objects.texts[id];
      if (text && !isLocked(text)) changeText(text, changes, TEXT_FIELDS);
    }),

    setTexts: (texts) => set((draft) => {
      draft.objects.texts = texts;
    }),

    addDrawing: (data) => {
      let id = '';
      const order = data.order === undefined ? orderOnTop(get()) : undefined;
      set((draft) => {
        const drawing = newDrawing(draft, data, order);
        draft.objects.drawings[id = drawing.id] = drawing;
      });
      return id;
    },

    addDrawings: (data) => {
      const ids: string[] = [];
      if (data.length === 0) return ids;
      let order = orderOnTop(get());
      set((draft) => {
        for (const one of data) {
          const drawing = newDrawing(draft, one, order++);
          draft.objects.drawings[drawing.id] = drawing;
          ids.push(drawing.id);
        }
      });
      return ids;
    },

    setDrawings: (drawings) => set((draft) => {
      // A new object, so that the write is seen as one
      draft.objects.drawings = { ...drawings };
    }),

    updateAnnotations: (ids, changes) => set((draft) => {
      for (const id of ids) {
        const drawing = draft.objects.drawings[id];
        const text = draft.objects.texts[id];
        const taken = changesTaken(drawing ?? text ?? {}, changes);
        if (!taken) continue;
        if (drawing) changeDrawing(drawing, taken, DRAWING_FIELDS);
        if (text) changeText(text, taken, TEXT_FIELDS_BESIDE_DRAWINGS);
      }
    }),

    moveAnnotations: (ids, dx, dy) => set((draft) => {
      for (const id of unlockedIds(ids, draft.objects)) {
        const drawing = draft.objects.drawings[id];
        const text = draft.objects.texts[id];
        if (drawing) shiftDrawing(drawing, dx, dy);
        if (text) {
          text.x += dx;
          text.y += dy;
        }
      }
    }),

    placeAnnotations: (places) => set((draft) => {
      for (const [id, place] of Object.entries(places)) {
        const drawing = draft.objects.drawings[id];
        const text = draft.objects.texts[id];
        if (isLocked(drawing) || isLocked(text)) continue;
        if (drawing) changeDrawing(drawing, place, DRAWING_FIELDS);
        if (text) changeText(text, place, TEXT_FIELDS);
      }
    }),

    deleteAnnotations: (ids) => set((draft) => removeAnnotations(draft, unlockedIds(ids, draft.objects))),

    orderAnnotations: (ids, to) => {
      const moves = reordered(annotationStack(get()), unlockedIds(ids, get().objects), to);
      // Already there, in their order: no write, and so no undo step that does nothing
      if (moves.length === 0) return;
      set((draft) => {
        for (const { id, kind, order } of moves) {
          const entry = draft.objects[kind][id];
          if (entry) entry.order = order;
        }
      });
    },

    replaceDrawings: (removedIds, added) => {
      const ids: string[] = [];
      if (removedIds.some((id) => isLocked(get().objects.drawings[id]))) return ids;
      set((draft) => {
        const { drawings } = draft.objects;
        removeAnnotations(draft, removedIds.filter((id) => drawings[id]));
        for (const one of added) {
          const drawing = newDrawing(draft, one, undefined);
          drawings[drawing.id] = drawing;
          ids.push(drawing.id);
        }
      });
      return ids;
    },

    clearAnnotations: (scope) => {
      const gone = annotationStack(get()).filter(({ entry }) => CLEARED[scope](entry)).map(({ id }) => id);
      if (gone.length > 0) set((draft) => removeAnnotations(draft, gone));
    },
  };
}
