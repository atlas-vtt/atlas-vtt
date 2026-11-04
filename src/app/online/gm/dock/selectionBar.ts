import { setIcon } from 'obsidian';
import { MOTION_EASE_OUT, prefersReducedMotion } from '../../../utils/motion';
import { textButton } from './controls.ts';
import { openMenuBelow } from './dockMenu.ts';
import { playerTitle } from './playerList.ts';
import type { OnlinePlayer, SelectionBar } from './panelModel.ts';
import { t } from '../../../i18n';

export interface SelectionActions {
  mark(tokenIds: readonly string[]): void;
  unmark(tokenIds: readonly string[]): void;
  assign(tokenIds: readonly string[], playerId: string): void;
  share(): void;
}

/** How far and how long the bar slides in. */
const SLIDE_PX = 6;
const SLIDE_MS = 160;

const tokensText = (count: number): string => t('online.selected', { count });

/**
 * The bar at the panel's foot, one row: how many tokens are selected on the shared map and what to do
 * with them, or, in another map's view, the button that shows that map to players. `entering` slides it in (it was not there before).
 */
export function renderSelectionBar(parent: HTMLElement, bar: SelectionBar, players: readonly OnlinePlayer[], actions: SelectionActions, entering: boolean): HTMLElement {
  const el = parent.createDiv({ cls: 'atlas-online-selection' });
  if (bar.kind === 'share') {
    el.addClass('atlas-online-selection--share');
    textButton(el, t('online.share'), () => actions.share()).dataset.focusKey = 'share';
  } else {
    el.createSpan({ cls: 'atlas-online-selection__text', text: tokensText(bar.tokenIds.length) });
    const buttons = el.createDiv({ cls: 'atlas-online-selection__actions' });
    const mark = bar.action === 'mark'
      ? textButton(buttons, t('online.makePlayer'), () => actions.mark(bar.tokenIds))
      : textButton(buttons, t('online.unmark'), () => actions.unmark(bar.tokenIds));
    mark.dataset.focusKey = 'mark';
    const assign = textButton(buttons, t('online.assign'), () => {
      openMenuBelow(players.map((player) => ({ title: playerTitle(player), run: () => actions.assign(bar.tokenIds, player.id) })), assign);
    });
    setIcon(assign.createSpan({ cls: 'atlas-online-chevron' }), 'chevron-down');
    assign.disabled = !bar.canAssign;
    assign.dataset.focusKey = 'assign';
  }
  if (entering && !prefersReducedMotion(el)) {
    el.animate([{ opacity: 0, transform: `translateY(${SLIDE_PX}px)` }, { opacity: 1, transform: 'none' }], { duration: SLIDE_MS, easing: MOTION_EASE_OUT });
  }
  return el;
}
