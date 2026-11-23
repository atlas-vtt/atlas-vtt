import { TURN_KEY_ATTRIBUTE } from '../initiative/motion/turnMotion';
import { createConditionBadge } from '../packages/components/shared/conditionBadgeElement';
import { playerCardKey } from './playerInitiativeCard';
import type { PlayerInitiativeList } from './playerInitiativeList';

/** A badge in the tip, grown with the list. */
const BADGE_SIZE = 'calc(18px * var(--atlas-initiative-scale, 1))';

/**
 * The GM hovers a combatant in the tracker (`CardConditionsTooltip`): the players' list scrolls its card into view with
 * `scrollTo` and names every condition it is under in a tip beside the list, centred on the card, as the GM's tooltip
 * stands beside the tracker. The tip lies in the panel, so it turns with a list turned for players across the table.
 * Nothing shows for a combatant players do not see or without conditions; the next drawing, once the GM moves on,
 * shows the turn again.
 */
export function showConditionsTip(panel: HTMLElement, entries: HTMLElement, list: PlayerInitiativeList, key: string, scrollTo: (card: HTMLElement) => void): void {
  const conditions = list.combatants.find(({ entry }) => playerCardKey(entry) === key)?.token.conditions ?? [];
  const card = [...entries.querySelectorAll<HTMLElement>(`[${TURN_KEY_ATTRIBUTE}]`)].find((candidate) => candidate.getAttribute(TURN_KEY_ATTRIBUTE) === key);
  if (!card || conditions.length === 0) return;
  scrollTo(card);
  const tip = panel.createDiv({ cls: 'tooltip-content atlas-player-initiative__conditions-tip', attr: { role: 'tooltip' } });
  const rows = tip.createEl('ul', { cls: 'atlas-initiative-conditions-tip' });
  for (const condition of conditions) {
    const row = rows.createEl('li', { cls: 'atlas-initiative-conditions-tip__row' });
    createConditionBadge(row, condition, BADGE_SIZE);
    row.createSpan({ cls: 'atlas-initiative-conditions-tip__name', text: condition.name });
  }
  // Where the card's middle lies along the list, in the panel's own frame (layout offsets, which a turned panel keeps)
  const across = panel.hasClass('atlas-initiative-panel--row');
  tip.style.setProperty('--atlas-conditions-tip-at', `${middleWithin(panel, card, across)}px`);
}

/** The middle of `card` along the list's axis, from the panel's edge, less what the list has scrolled. */
function middleWithin(panel: HTMLElement, card: HTMLElement, across: boolean): number {
  let offset = across ? card.offsetWidth / 2 : card.offsetHeight / 2;
  for (let element: HTMLElement | null = card; element && element !== panel; element = element.offsetParent as HTMLElement | null) {
    offset += across ? element.offsetLeft : element.offsetTop;
  }
  for (let element = card.parentElement; element && element !== panel; element = element.parentElement) {
    offset -= across ? element.scrollLeft : element.scrollTop;
  }
  return offset;
}
