import type { App, WorkspaceLeaf } from 'obsidian';
import { t } from '../../../i18n';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import { panToToken } from '../../../pixi/tokenFocus';
import { showNoticeWithAction } from '../../../ui/notice';
import type { ObservedStore } from '../atlasView.ts';
import type { MapCanvas, MapView } from '../mapView.ts';
import type { PresentedStore } from '../presentedStore.ts';
import { addDoorAsk } from './doorAskStore.ts';
import type { DoorAskShown } from './PlayerDoorAsks.ts';

/** The Atlas tab an ask belongs to: its leaf, view and renderer, its own store and the store players see. */
export interface DoorAskTab {
  readonly app: App;
  readonly leaf: WorkspaceLeaf;
  readonly view: MapView;
  readonly renderer: MapCanvas;
  readonly store: ObservedStore;
  readonly presented: PresentedStore;
}

/**
 * Brings the GM to the door asked about: the tab's leaf in front, the presented scene's tab where the
 * GM works on another, the door's level, and the camera gliding to the door.
 */
async function revealDoor(tab: DoorAskTab, shown: DoorAskShown): Promise<void> {
  tab.app.workspace.setActiveLeaf(tab.leaf, { focus: true });
  await tab.app.workspace.revealLeaf(tab.leaf);
  const tabId = tab.presented.presentedTabId;
  if (tab.presented.held && tabId !== null) await tab.view.switchToTab(tabId);
  const state = tab.view.atlasStore.getState();
  if (shown.level !== null && hasLevels(state.levels) && viewedLevelId(state) !== shown.level) state.setViewedLevel(shown.level);
  const viewport = tab.renderer.getViewportInstance();
  if (viewport !== null) panToToken(viewport, { ...shown.at, size: 1 }, tab.store.getState().grid?.size ?? 70);
}

/**
 * Tells the GM of a player's ask to open a door: a notice that stays until the ask is answered (a click
 * on it, or on Show, brings the GM to the door) and the popover beside the door on the map
 * (`DoorAskPopoverHost`). Returns what takes both away.
 */
export function showDoorAsk(tab: DoorAskTab, shown: DoorAskShown): () => void {
  const reveal = (): void => void revealDoor(tab, shown);
  const remove = addDoorAsk({
    key: shown.key, who: shown.who, mapPath: tab.presented.getState().mapPath ?? '', level: shown.level, at: shown.at,
    answer: (open) => shown.answer(open), reveal,
  });
  const notice = showNoticeWithAction(t('online.doorAsk', { player: shown.who }), t('online.doorAskShow'), reveal, 0);
  // The whole notice brings the GM to the door; Obsidian closes it on any click.
  notice.containerEl.addEventListener('click', (event) => {
    const target = event.target as Partial<Element> | null;
    if (target?.closest?.('a') == null) reveal();
  });
  return () => {
    remove();
    notice.hide();
  };
}
