import type { DrawingStroke, TextElement } from '../types';

/** The drawings and texts of a scene, on every level, as they were at one moment. */
export interface AnnotationsBefore {
  readonly drawings: Record<string, DrawingStroke>;
  readonly texts: Record<string, TextElement>;
}

/** A view's state as far as its drawings and texts go, with the actions that write them whole. */
export interface AnnotationsHolder {
  readonly objects: AnnotationsBefore;
  setDrawings(drawings: Record<string, DrawingStroke>): void;
  setTexts(texts: Record<string, TextElement>): void;
}

/** The scene's drawings and texts as they are now: the records themselves, which no write changes. */
export function annotationsNow(state: Pick<AnnotationsHolder, 'objects'>): AnnotationsBefore {
  const { drawings, texts } = state.objects;
  return { drawings, texts };
}

/**
 * Makes the scene's drawings and texts what they were at `before`, for a gesture that is dropped
 * after it wrote (an eraser's sweep whose press is lost). The gesture's own undo step is its to abandon.
 */
export function putAnnotationsBack(state: AnnotationsHolder, before: AnnotationsBefore): void {
  if (state.objects.drawings !== before.drawings) state.setDrawings(before.drawings);
  if (state.objects.texts !== before.texts) state.setTexts(before.texts);
}
