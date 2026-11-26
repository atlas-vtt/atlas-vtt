import type { App, WorkspaceLeaf } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { t } from '../../../i18n';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import { panToToken } from '../../../pixi/tokenFocus';
import { showNoticeWithAction } from '../../../ui/notice';
import { field } from '../atlasLighting.ts';
import { call, type SceneStore } from '../atlasView.ts';
import type { PresentedStore } from '../presentedStore.ts';
import { addDoorAsk } from './doorAskStore.ts';
import type { DoorAskShown } from './PlayerDoorAsks.ts';

/** The Atlas tab an ask belongs to: its leaf, view and renderer, its own store and the store players see. */
export interface DoorAskTab {
  readonly app: App;
  readonly leaf: WorkspaceLeaf;
  readonly view: object;
  readonly renderer: object;
  readonly store: SceneStore;
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
  const switchToTab = field(tab.view, 'switchToTab');
  if (tab.presented.held && tabId !== null && typeof switchToTab === 'function') await (switchToTab as (id: string) => Promise<void>).call(tab.view, tabId);
  const state = tab.store.getState();
  const setLevel = field(state, 'setViewedLevel');
  if (shown.level !== null && hasLevels(state.levels) && viewedLevelId(state) !== shown.level && typeof setLevel === 'function') (setLevel as (id: string) => void)(shown.level);
  const viewport = call(tab.renderer, 'getViewportInstance') as Viewport | undefined;
  if (viewport !== undefined) panToToken(viewport, { ...shown.at, size: 1 }, tab.store.getState().grid?.size ?? 70);
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

/** Shows a player's token bump on the tab's map, where its token renderer can (`TokenRenderer.bumpToken`). */
export function bumpOnTab(renderer: object, tokenId: string, dx: number, dy: number): void {
  const tokens = call(renderer, 'getTokenRenderer');
  const bump = field(tokens, 'bumpToken');
  if (typeof bump === 'function') (bump as (id: string, x: number, y: number) => void).call(tokens, tokenId, dx, dy);
}
