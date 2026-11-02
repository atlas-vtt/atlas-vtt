import type { StoreApi } from 'zustand';
import type { ContextMenuEntry } from '../../root/ContextMenuContext';
import type { ViewAtlasState } from '../../../storeFactory';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import { levelLabel } from '../levels/levelEditing';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

/**
 * "Move to level ▸" for the tokens `tokenIds` (the selection, or the token clicked): every other
 * level of the scene, top floor first. One store write, so one undo step; the view stays where it is.
 * None in a scene with one level.
 */
export function tokenLevelSubmenu(store: Pick<StoreApi<ViewAtlasState>, 'getState'>, tokenIds: readonly string[]): ContextMenuEntry | null {
  const state = store.getState();
  const { levels } = state;
  if (!hasLevels(levels)) return null;
  const viewed = viewedLevelId(state);
  const children: ContextMenuEntry[] = [...levels].reverse().filter((level) => level.id !== viewed).map((level) => ({
    type: 'item',
    label: levelLabel(levels, level),
    onClick: () => {
      store.getState().moveTokensToLevel(tokenIds, level.id);
      showNotice(t('levels.movedNotice', { name: levelLabel(levels, level) }));
    },
  }));
  return { type: 'submenu', label: t('levels.moveTo'), icon: 'layers', children };
}
