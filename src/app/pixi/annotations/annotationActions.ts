import { collectMapObjects, translateMapObjects } from '../../clipboard/mapObjectContent';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import { tellCopiesLeftOut } from './annotationNotices';
import type { FullOf } from './DrawToolHost';

type Store = { getState(): ViewAtlasState };

/**
 * Leaves copies of the annotations `ids` moved by (dx, dy) and selects them, in one undo step: what
 * an Alt-drag of drawings and texts ends in. As many as the level has room for, which `full` is
 * told where it is not all of them.
 */
export function copyAnnotationsMoved(store: Store, ids: readonly string[], dx: number, dy: number, full: (of: FullOf) => void): void {
  const state = store.getState();
  const objects = levelObjects(state);
  const content = translateMapObjects(collectMapObjects(objects, ids), { x: dx, y: dy });
  tellCopiesLeftOut(objects, content, full);
  state.insertMapObjects(content);
}
