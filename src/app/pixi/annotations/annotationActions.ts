import { annotationRoom } from '../../annotations/annotationList';
import { isLocked } from '../../annotations/annotationLock';
import type { TextAnnotation } from '../../annotations/annotationTypes';
import { collectMapObjects, translateMapObjects } from '../../clipboard/mapObjectContent';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import type { FullOf } from './DrawToolHost';

type Store = { getState(): ViewAtlasState };

/**
 * Asks for the words of `text` anew and writes them, in one undo step. Nothing where none are
 * given, they are the same, or the text is gone by the time the answer comes; a locked text is
 * not asked about.
 */
export async function editTextWords(store: Store, text: TextAnnotation, ask: (words: string) => Promise<string | null>): Promise<void> {
  if (isLocked(levelObjects(store.getState()).texts[text.id])) return;
  const words = await ask(text.text);
  const state = store.getState();
  if (!words || words === text.text || !levelObjects(state).texts[text.id]) return;
  state.updateText(text.id, { text: words });
}

/**
 * Leaves copies of the annotations `ids` moved by (dx, dy) and selects them, in one undo step: what
 * an Alt-drag of drawings and texts ends in. None where the level cannot hold them, which `full` is told.
 */
export function copyAnnotationsMoved(store: Store, ids: readonly string[], dx: number, dy: number, full: (of: FullOf) => void): void {
  const state = store.getState();
  const objects = levelObjects(state);
  const content = translateMapObjects(collectMapObjects(objects, ids), { x: dx, y: dy });
  const room = annotationRoom(objects);
  if (content.drawings.length > room.drawings) full('drawings');
  else if (content.texts.length > room.texts) full('texts');
  else state.insertMapObjects(content);
}
