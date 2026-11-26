import type { StoreApi } from 'zustand';
import { copyMapObjects, holdsMapClipboard, pasteClipboard, viewCentre } from '../clipboard/mapClipboardActions';
import type { ViewAtlasState } from '../storeFactory';
import { levelObjects } from '../levels/levelObjects';
import { mapTokens, withoutOffMap } from '../tokens/offMap';
import { runInBackground } from '../utils/backgroundTask';
import type { AnnotationActionExtras } from './annotationActionList';

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

/** Pastes what was copied in the middle of what the view shows, as one undo step. */
export function pasteAtViewCentre(store: StoreApi<ViewAtlasState>, viewport: Parameters<typeof viewCentre>[0]): void {
  runInBackground(pasteClipboard(store, viewCentre(viewport)), 'Pasting map objects', 'Could not paste');
}

/**
 * What the actions of the drawings and texts `ids` do beyond themselves: where tokens are selected
 * with them, Duplicate and Delete take everything selected; under a finger (`touch`) there is Copy
 * and Paste too.
 */
export function annotationExtras(store: StoreApi<ViewAtlasState>, viewport: Parameters<typeof viewCentre>[0], ids: readonly string[], touch: boolean): AnnotationActionExtras {
  const state = store.getState();
  const whole = selectedWithOthers(state, ids)
    ? { ids: state.selectedIds, remove: (): void => store.getState().removeMapObjects(withoutOffMap(store.getState().objects, state.selectedIds)) }
    : undefined;
  return {
    whole,
    touch: touch ? {
      copy: () => runInBackground(copyMapObjects(store, whole?.ids ?? ids), 'Copying map objects', 'Could not copy the selection'),
      paste: () => pasteAtViewCentre(store, viewport),
      canPaste: holdsMapClipboard(),
    } : undefined,
  };
}

/**
 * Selects every token the canvas shows (`shown`: the session view hides tokens, which must not be
 * selected unseen); every token of the level shown where the canvas cannot be asked.
 */
export function selectAllTokens(store: StoreApi<ViewAtlasState>, shown: { visibleTokenIds(): string[] } | null | undefined): void {
  const ids = shown?.visibleTokenIds() ?? Object.keys(mapTokens(levelObjects(store.getState())));
  if (ids.length > 0) store.getState().setSelection(ids);
}
