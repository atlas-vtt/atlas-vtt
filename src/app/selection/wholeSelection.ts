import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { withoutOffMap } from '../tokens/offMap';

/**
 * Everything selected, of every kind: what Duplicate, Copy and Delete act on, from the menu and
 * from the bar above a selection, as their keys do. One store action each, so one undo step.
 */

/** Everything selected with `id` when it is selected, tokens, drawings and texts alike; else `id` alone. */
export function groupOf(state: Pick<ViewAtlasState, 'selectedIds'>, id: string): string[] {
  return state.selectedIds.includes(id) ? [...state.selectedIds] : [id];
}

/** Whether something else is selected with `ids`, which are selected themselves. */
export function selectedWithOthers(state: Pick<ViewAtlasState, 'selectedIds'>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => state.selectedIds.includes(id)) && state.selectedIds.length > ids.length;
}

/**
 * Deletes the token `tokenId` and what is selected with it: `targets`, the tokens among them, where
 * nothing else is selected; else everything selected, as the Delete key does.
 */
export function deleteWholeSelection(store: StoreApi<ViewAtlasState>, tokenId: string, targets: string[]): void {
  const state = store.getState();
  const group = groupOf(state, tokenId);
  if (group.length === targets.length) state.deleteTokens(targets);
  else state.removeMapObjects(withoutOffMap(state.objects, group));
}
