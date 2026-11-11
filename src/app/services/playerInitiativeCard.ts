import { setIcon } from 'obsidian';
import { createTokenPortrait } from '../packages/components/shared/tokenPortraitElement';
import { createConditionBadge } from '../packages/components/shared/conditionBadgeElement';
import { combatantColor, turnColor } from '../initiative/combatantColor';
import { nameShownToPlayers } from '../pixi/token-renderer/nameplateVisibility';
import { turnsLabel, type CombatantCondition } from '../initiative/combatantConditions';
import { formatList, t } from '../i18n';
import type { Combatant, PlayerInitiativeLook } from './playerInitiativeList';


/** What a combatant shows beside its portrait: its number, the card it was dealt, or nothing (by sides). */
export type PlayerCardValue = 'number' | 'card' | 'none';

/** Diameter of a condition badge on a card, as the GM's cards draw them. */
// Grows with the list
const CONDITION_SIZE = 'calc(28px * var(--atlas-player-initiative-scale, 1))';
/** The most badges over a card; past them the rest are a count, which takes the last place. */
const SHOWN_CONDITIONS = 4;

/**
 * One combatant of the players' list: its portrait as the map draws its token, the number its
 * badge shows players, its initiative (blank while it has none or 0), name (a placeholder where the GM's map
 * shows none), hit points and conditions.
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
  // The colour the GM gave the card
  const color = combatantColor(entry);
  if (color) {
    card.addClass('atlas-player-initiative__card--coloured');
    card.style.setProperty('--atlas-combatant-color', color);
  }
  // Its turn flashes in its own colour
  const flash = turnColor(entry, token);
  if (flash) card.style.setProperty('--atlas-turn-color', flash);
  const src = entry.imagePath ? look.portraitSrc(entry.imagePath) : null;
  // A combatant the GM's map leaves unnamed shows a placeholder for its name
  const name = nameShownToPlayers(entry.name, token, look.mapShowsNameplates, look.showNames);
  const portrait = src
    ? createTokenPortrait(card, { src, alt: name === entry.name ? name : '', cls: 'atlas-player-initiative__avatar', showRing: token.showRing, ringColor: token.ringColor })
    : null;
  const badge = entry.tokenId === undefined ? null : look.badgeNumber?.(entry.tokenId) ?? null;
  if (badge !== null) (portrait ?? card).createSpan({ cls: 'atlas-player-initiative__badge', text: String(badge) });
  if (token.defeated) renderDefeated(card, src !== null);
  // A combatant without a number yet shows a dash, not a 0 nobody rolled
  if (value === 'number') card.createSpan({ cls: 'atlas-player-initiative__value', text: entry.initiative !== 0 ? String(entry.initiative) : '\u00a0' });
  if (value === 'card') card.createSpan({ cls: 'atlas-player-initiative__value atlas-player-initiative__card-dealt', text: entry.card === undefined ? '–' : String(entry.card) });
  // An entry without a token or a portrait (an enemy added by name, a player without a picture) has
  // nothing but its name to tell it apart; a token's name stays the GM's to show
  const shownName = name ?? (!portrait && entry.tokenId === undefined ? entry.name : null);
  if (shownName !== null) card.createSpan({ cls: 'atlas-player-initiative__name', text: shownName });
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

/**
 * The conditions the map shows players on the token, or the tracker gave the combatant, each named for assistive
 * tech ("Frightened 2", "Poisoned, 2 turns left"). They stand over the card's top edge: side by side, overlapping
 * from three on (they are large, to be read across the table), and past `SHOWN_CONDITIONS` the rest as a count; one that lasts a number of turns shows what is left.
 */
function renderConditions(card: HTMLElement, conditions: readonly CombatantCondition[]): void {
  card.addClass('atlas-player-initiative__card--conditions');
  const list = card.createDiv({ cls: 'atlas-player-initiative__conditions', attr: { role: 'list', 'aria-label': t('playerInit.conditions') } });
  if (conditions.length > 2) list.addClass('atlas-player-initiative__conditions--stacked');
  const shown = conditions.length > SHOWN_CONDITIONS ? conditions.slice(0, SHOWN_CONDITIONS - 1) : conditions;
  for (const condition of shown) {
    const item = list.createSpan({ cls: 'atlas-player-initiative__condition', attr: { role: 'listitem', 'aria-label': turnsLabel(condition) } });
    createConditionBadge(item, condition, CONDITION_SIZE);
    if (condition.turns !== undefined) item.createSpan({ cls: 'atlas-player-initiative__condition-turns', text: String(condition.turns), attr: { 'aria-hidden': 'true' } });
  }
  const rest = conditions.slice(shown.length);
  if (rest.length > 0) list.createSpan({ cls: 'atlas-player-initiative__condition-more', text: `+${rest.length}`, attr: { role: 'listitem', 'aria-label': formatList(rest.map(turnsLabel)) } });
}
