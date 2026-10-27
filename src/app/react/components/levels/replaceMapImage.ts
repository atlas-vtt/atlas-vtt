import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { LEVEL_HEIGHT, levelBackground, newLevelId, withLevelChanged } from '../../../levels/levelEdits';
import { replacementFit, type ImageSize } from '../../../levels/levelImageReplace';
import { firstLevelId, isLevelOf } from '../../../levels/sceneLevels';
import { mapImageSize } from '../../../pixi/mapImage/mapImageSize';
import type { ViewAtlasStore } from '../../../storeFactory';
import { getHistoryStore, runHistoryTransaction, runUntracked } from '../../../stores/history';
import type { LevelAlignment } from '../../../types/sceneLevelTypes';
import { showNotice } from '../../../ui/notice';
import { describeError } from '../../../utils/errors';
import { changeLevelBackground } from './levelEditing';

/** The size of a map image, or the sentence that says why it cannot be read. */
async function sizeOf(app: App, path: string): Promise<ImageSize | null | string> {
  try {
    return await mapImageSize(app, path);
  } catch (error) {
    return describeError(error);
  }
}

/**
 * Shows `path` on level `levelId` (null: a scene without levels), drawn by `alignment` where it
 * needs one. The first level's map is the scene's `background`, which undo reaches, so there the
 * swap and its alignment are one undo step; a scene without levels gets its one level first (no
 * step: levels are scene settings), which carries the alignment. Another level's map is a scene
 * setting like its name, never an undo step: a new alignment is written with it, and the history,
 * whose steps fitted the old image, is let go of.
 */
function writeReplacement(store: ViewAtlasStore, levelId: string | null, path: string, alignment: LevelAlignment | null): void {
  let state = store.getState();
  let id = levelId ?? firstLevelId(state.levels);
  if (alignment && id === null) {
    const level = { id: newLevelId(), name: t('levels.firstName'), elevation: { bottom: 0, top: LEVEL_HEIGHT }, background: state.background };
    runUntracked(store, () => state.setLevels([level]));
    id = level.id;
    state = store.getState();
  }
  if (id === null || id === firstLevelId(state.levels)) {
    runHistoryTransaction(store, () => {
      store.getState().setBackground(path);
      if (alignment && id !== null) store.getState().alignLevel(id, alignment);
    });
    return;
  }
  if (!alignment) {
    changeLevelBackground(store, id, path);
    return;
  }
  const levels = withLevelChanged(state.levels ?? [], id, { background: path });
  runUntracked(store, () => {
    store.getState().setLevels(levels);
    store.getState().alignLevel(id, alignment);
  });
  getHistoryStore(store)?.getState().clear();
}

/**
 * Replaces the map image of level `levelId` (null: a scene without levels) with `path`, scaled onto
 * the world rect of the image it replaces (`replacementFit`), so the grid, walls, lights and tokens
 * stay on the art: a video of the same map, its gridless version, a larger export. An image of
 * another shape is refused with a sentence that says so. A level without an image, or whose image
 * is gone, simply takes the new one. Nothing is written when the view moved on meanwhile.
 */
export async function replaceMapImage(app: App, store: ViewAtlasStore, levelId: string | null, path: string): Promise<void> {
  const before = store.getState();
  const old = levelBackground(before, levelId);
  if (old === path) return;
  const [oldSize, nextSize] = await Promise.all([old ? sizeOf(app, old) : null, sizeOf(app, path)]);
  const now = store.getState();
  if (now.mapPath !== before.mapPath || (levelId !== null && !isLevelOf(now.levels, levelId))) return;
  if (typeof nextSize === 'string' || nextSize === null) {
    showNotice(t('levels.replaceUnreadable', { file: path, reason: typeof nextSize === 'string' ? nextSize : t('levels.replaceMissing') }));
    return;
  }
  if (typeof oldSize !== 'object' || oldSize === null) {
    writeReplacement(store, levelId, path, null);
    return;
  }
  const fit = replacementFit(now, levelId, oldSize, nextSize);
  if (fit.kind === 'aspect') {
    showNotice(t('levels.replaceAspect', { old: `${oldSize.width} × ${oldSize.height}`, next: `${nextSize.width} × ${nextSize.height}` }));
    return;
  }
  if (fit.kind === 'scale') {
    showNotice(t('levels.replaceScale'));
    return;
  }
  writeReplacement(store, levelId, path, fit.kind === 'scaled' ? fit.alignment : null);
}
