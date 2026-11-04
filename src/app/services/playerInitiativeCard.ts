import { setIcon } from 'obsidian';
import { createTokenPortrait } from '../packages/components/shared/tokenPortraitElement';
import { createConditionBadge } from '../packages/components/shared/conditionBadgeElement';
import { hasInitiative } from '../initiative/awaitingInitiative';
import type { ActiveCondition } from '../utils/activeConditions';
import type { Combatant, PlayerInitiativeLook } from './playerInitiativeList';
import { t } from '../i18n';

/** What a combatant shows beside its portrait: its number, the card it was dealt, or nothing (by sides). */
export type PlayerCardValue = 'number' | 'card' | 'none';

/** Diameter of a condition badge on a card, as the GM's cards draw them. */
const CONDITION_SIZE = 18;

/**
 * One combatant of the players' list: its portrait as the map draws its token, the number its
 * badge shows players, its initiative (a dash while it has none), name, hit points and conditions.
 * `combatActive` marks the combatant whose turn it is; `value` is its number, the card it was
 * dealt in a fight by cards (a dash before one is), or none by sides.
 */
export function renderPlayerCard(parent: HTMLElement, { entry, token }: Combatant, look: PlayerInitiativeLook, combatActive: boolean, value: PlayerCardValue = 'number'): void {
  const card = parent.createDiv({ cls: 'atlas-player-initiative__card', attr: { role: 'listitem' } });
  if (combatActive && entry.isActive) {
    card.addClass('atlas-player-initiative__card--active');
    card.setAttribute('aria-current', 'true');
  }
  if (entry.sitsOut) card.addClass('atlas-player-initiative__card--sitting-out');
  if (entry.delayed) card.addClass('atlas-player-initiative__card--delayed');
  const src = entry.imagePath ? look.portraitSrc(entry.imagePath) : null;
  const portrait = src
    ? createTokenPortrait(card, { src, alt: look.showNames ? entry.name : '', cls: 'atlas-player-initiative__avatar', showRing: token.showRing, ringColor: token.ringColor })
    : null;
  const badge = look.badgeNumber?.(entry.tokenId) ?? null;
  if (badge !== null) (portrait ?? card).createSpan({ cls: 'atlas-player-initiative__badge', text: String(badge) });
  if (token.defeated) renderDefeated(card, src !== null);
  // A combatant without a number yet shows a dash, not a 0 nobody rolled
  if (value === 'number') card.createSpan({ cls: 'atlas-player-initiative__value', text: hasInitiative(entry) ? String(entry.initiative) : '–' });
  if (value === 'card') card.createSpan({ cls: 'atlas-player-initiative__value atlas-player-initiative__card-dealt', text: entry.card === undefined ? '–' : String(entry.card) });
  if (look.showNames) {
    card.createSpan({ cls: 'atlas-player-initiative__name', text: entry.name });
  }
  const { hp } = token;
  if (hp && hp.max > 0) {
    card.createEl('progress', {
      cls: 'atlas-player-initiative__hp',
      attr: { max: hp.max, value: Math.max(0, hp.current), 'aria-label': 'HP' },
    });
  }
  if (token.conditions?.length) renderConditions(card, token.conditions);
}

/** The GM card's skull, over a defeated combatant's portrait (in its place without one); the card is dimmed with it. */
function renderDefeated(card: HTMLElement, overPortrait: boolean): void {
  card.addClass('atlas-player-initiative__card--defeated');
  const mark = card.createSpan({ cls: 'atlas-player-initiative__defeated', attr: { role: 'img', 'aria-label': t('playerInit.defeated') } });
  if (overPortrait) mark.addClass('atlas-player-initiative__defeated--over');
  setIcon(mark, 'skull');
}

/** The conditions the map shows players on the token, each named for assistive tech ("Frightened 2"). */
function renderConditions(card: HTMLElement, conditions: readonly ActiveCondition[]): void {
  const list = card.createDiv({ cls: 'atlas-player-initiative__conditions', attr: { role: 'list', 'aria-label': t('playerInit.conditions') } });
  for (const condition of conditions) {
    const item = list.createSpan({ cls: 'atlas-player-initiative__condition', attr: { role: 'listitem', 'aria-label': condition.name } });
    createConditionBadge(item, condition, CONDITION_SIZE);
  }
}
