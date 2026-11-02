import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { mayLinkFromScene } from '../services/sceneLinks';
import { readMapClipboard, writeMapClipboard } from './mapClipboard';
import { collectMapObjects, countMapObjects, type MapObjectContent, type Point } from './mapObjectContent';
import { pasteOffset, placeMapObjects } from './mapObjectPlacement';
import { levelObjects } from '../levels/levelObjects';
import { levelLinkList, MAX_LEVEL_LINKS } from '../levels/levelLinks';
import { hasLevels } from '../levels/sceneLevels';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';
import { withoutOffMap } from '../tokens/offMap';

type ClipboardStore = Pick<StoreApi<ViewAtlasState>, 'getState'>;

/** Players never edit the map, and walls keep their own selection, so the wall tool opts out too. */
function canEditMapObjects(state: ViewAtlasState): boolean {
  return !state.isPlayerView && state.activeTool !== 'wall';
}

/**
 * Ids that copy, cut and duplicate act on: in the stairs tool the stairs whose popover is open, which
 * is how it selects them; never a combatant beside the map, which a cut would delete unseen.
 */
function editableSelection(state: ViewAtlasState): string[] {
  if (!canEditMapObjects(state)) return [];
  if (state.activeTool === 'stairs') return state.levelLinkPopover ? [state.levelLinkPopover] : [];
  return withoutOffMap(state.objects, state.selectedIds);
}

function copyableContent(state: ViewAtlasState, ids: readonly string[]): MapObjectContent | null {
  const content = collectMapObjects(state.objects, ids, state);
  return countMapObjects(content) > 0 ? content : null;
}

/** Tells the GM when copied stairs cannot all land: the scene has one level, or the map holds as many as it may. */
function tellStairsLeftOut(state: ViewAtlasState, content: MapObjectContent): void {
  const count = content.levelLinks.length;
  if (count === 0) return;
  if (!hasLevels(state.levels)) showNotice(t('levels.stairsPasteOneLevel'));
  else if (count > MAX_LEVEL_LINKS - levelLinkList(state.objects.levelLinks).length) showNotice(t('levels.stairsFull', { count: MAX_LEVEL_LINKS }));
}

/** Puts the tokens, drawings, texts, pins and stairs with the given ids on the clipboard. Returns whether anything was copied. */
export async function copyMapObjects(store: ClipboardStore, ids: readonly string[]): Promise<boolean> {
  const content = copyableContent(store.getState(), ids);
  if (!content) return false;
  await writeMapClipboard(content);
  return true;
}

export function copySelection(store: ClipboardStore): Promise<boolean> {
  return copyMapObjects(store, editableSelection(store.getState()));
}

/** Copies the selection, then removes it from the map in one undo step. */
export async function cutSelection(store: ClipboardStore): Promise<boolean> {
  const state = store.getState();
  const ids = editableSelection(state);
  const content = copyableContent(state, ids);
  if (!content) return false;
  state.removeMapObjects(ids);
  await writeMapClipboard(content);
  return true;
}

/**
 * Pastes the clipboard centred on `target` (world coordinates) and returns the
 * ids of the copies. Pins that open a scene of another collection stay behind,
 * since scenes only link within their collection.
 */
export async function pasteClipboard(store: ClipboardStore, target: Point): Promise<string[]> {
  const copied = await readMapClipboard();
  const state = store.getState();
  if (!copied || !canEditMapObjects(state)) return [];
  const content = { ...copied, pins: copied.pins.filter((pin) => mayLinkFromScene(state.mapPath, pin.notePath)) };
  if (countMapObjects(content) === 0) return [];
  const placed = placeMapObjects(content, pasteOffset(content, target, state.grid), state.grid, levelObjects(state));
  tellStairsLeftOut(state, placed);
  return state.insertMapObjects(placed);
}

/** Duplicates the selection one grid cell away and returns the ids of the copies. */
export function duplicateSelection(store: ClipboardStore): string[] {
  const state = store.getState();
  const ids = editableSelection(state);
  const content = copyableContent(state, ids);
  if (content) tellStairsLeftOut(state, content);
  return state.duplicateMapObjects(ids);
}
