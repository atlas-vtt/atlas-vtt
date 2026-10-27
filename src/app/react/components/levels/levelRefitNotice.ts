import { formatList, t } from '../../../i18n';
import type { ViewAtlasStore } from '../../../storeFactory';
import { showNotice } from '../../../ui/notice';
import { levelLabel } from './levelEditing';

/**
 * Tells the GM, once per change, which floors no longer fit the scene's grid after its type
 * changed (square and hex): their images were fitted to the old grid, and no alignment carries
 * over to the other type (`levelsCarriedWithGrid`). Returns the unsubscribe.
 */
export function watchLevelsToRefit(store: ViewAtlasStore): () => void {
  return store.subscribe((state) => state.grid?.type ?? 'square', () => {
    const { levels, levelAlignments, mapLoaded, isMapLoading } = store.getState();
    if (!mapLoaded || isMapLoading || !levels) return;
    const names = levels.filter((level) => levelAlignments?.[level.id]).map((level) => levelLabel(levels, level));
    if (names.length > 0) showNotice(t('levels.refit', { names: formatList(names) }));
  });
}
