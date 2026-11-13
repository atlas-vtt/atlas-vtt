import { annotationRoom } from '../../annotations/annotationList';
import { collectMapObjects, translateMapObjects } from '../../clipboard/mapObjectContent';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import type { FullOf } from './DrawToolHost';

type Store = { getState(): ViewAtlasState };

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
