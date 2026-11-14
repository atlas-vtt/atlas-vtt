/** What a fog area's badge offers on a right-click, and when its name can be edited. */
import { areaIsHidden, isFogArea } from '../../fog/fogAreas';
import { t } from '../../i18n';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import { viewedFog } from './FogPicture';

/** Reveal or Hide (whichever the area is not), Rename, and Delete last. Nothing for an id that is no area of the level shown. */
export function fogAreaMenuEntries(store: Pick<ViewAtlasStore, 'getState'>, areaId: string): ContextMenuEntry[] {
  const area = viewedFog(store.getState())[areaId];
  if (!isFogArea(area)) return [];
  const hidden = areaIsHidden(area);
  return [
    { type: 'item', label: hidden ? t('fog.reveal') : t('fog.hide'), icon: hidden ? 'eye' : 'eye-off', onClick: () => store.getState().flipFogArea(areaId) },
    { type: 'item', label: t('common.rename'), icon: 'pencil', onClick: () => store.getState().openFogAreaPopover(areaId) },
    { type: 'item', label: t('common.delete'), icon: 'trash-2', destructive: true, onClick: () => store.getState().deleteFogAreas([areaId]) },
  ];
}

/** Opens the menu of the area's badge at a screen point. */
export function showFogAreaMenu(store: Pick<ViewAtlasStore, 'getState'>, areaId: string, screenX: number, screenY: number): void {
  const entries = fogAreaMenuEntries(store, areaId);
  if (entries.length > 0) openContextMenuGlobal(entries, { x: screenX, y: screenY });
}

/** An area's name is edited only while the area is on the level shown, in the GM's view of a loaded scene. */
export function mayRenameFogArea(state: ViewAtlasState, areaId: string): boolean {
  return isFogArea(viewedFog(state)[areaId]) && state.isGMView && !state.isPlayerView && !state.isMapLoading;
}
