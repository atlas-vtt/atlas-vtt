import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { collectMapObjects } from '../../clipboard/mapObjectContent';
import { levelObjects } from '../../levels/levelObjects';
import { tellCopiesLeftOut } from '../annotations/annotationNotices';
import { mapTokens } from '../../tokens/offMap';

type Positions = Record<string, { x: number; y: number }>;

/**
 * Alt/Option-drag: copies the dragged tokens where they stand, so the drag carries the copies
 * away and the originals stay put. Drawings and texts in the selection are copied too; their copies
 * stay behind while their own drag keeps moving the originals, which reads the same on screen.
 * The moving group becomes the selection, unless it is a token dragged from outside the
 * selection (`fromSelection` false): that copy moves alone and the selection stays as it was.
 *
 * Call it inside the drag's history transaction, which makes the copy and the move one undo
 * step, and before anything has moved: the token drag registers its pointer listener before
 * the annotations' own, so this runs first on the move that crosses the drag threshold.
 * Returns the token copies' ids with their start positions, or null when nothing was copied.
 */
export function copyDragSelection(
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
  dragIds: readonly string[],
  initialPositions: Positions,
  fromSelection = true,
): { ids: string[]; initialPositions: Positions } | null {
  const state = store.getState();
  const tokenIds = dragIds.filter((id) => mapTokens(levelObjects(state))[id] && initialPositions[id]);
  if (tokenIds.length === 0) return null;
  const objects = levelObjects(state);
  const annotationIds = fromSelection ? state.selectedIds.filter((id) => objects.drawings[id] || objects.texts[id]) : [];

  // Tokens are inserted first, in the order they were collected, so copies line up with tokenIds.
  const content = collectMapObjects(objects, [...tokenIds, ...annotationIds]);
  // A level that is full takes the tokens' copies and no drawing's or text's: the GM is told why.
  tellCopiesLeftOut(objects, content);
  const copies = state.insertMapObjects(content);
  const ids = copies.slice(0, tokenIds.length);
  if (fromSelection) state.setSelection([...ids, ...annotationIds]);

  const positions: Positions = {};
  ids.forEach((id, index) => {
    positions[id] = initialPositions[tokenIds[index]!]!;
  });
  return { ids, initialPositions: positions };
}
