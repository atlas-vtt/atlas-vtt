/** Which combatants a fight by cards deals one card to. */

import type { TokenEntity } from '../types';
import type { CardsFight, InitiativeEntry } from '../types/initiativeTypes';
import { cardsNeeded, type CardGroupOf } from './cardDeal';
import { sideOf } from './sides';

/**
 * Every combatant its own card; with `share`, combatants that are not on the players' side and
 * look alike (the same art, as the map numbers look-alikes) one card between them.
 */
export function cardGroupOf(tokens: Readonly<Record<string, TokenEntity>>, share: boolean): CardGroupOf {
  return (entry) => {
    const token = tokens[entry.tokenId];
    if (share && token?.imagePath && sideOf(token) !== 'players') return `art:${token.imagePath}`;
    return `entry:${entry.id}`;
  };
}

/**
 * The groups a deal of `fight` uses: look-alikes share where the fight says so, and also where the
 * deck holds too few cards for one each, as games dealt from a deck of ten have it.
 */
export function dealGroupOf(fight: Pick<CardsFight, 'deck' | 'share'>, entries: readonly InitiativeEntry[], tokens: Readonly<Record<string, TokenEntity>>): CardGroupOf {
  const alone = cardGroupOf(tokens, false);
  if (!fight.share && cardsNeeded(entries, alone) <= fight.deck) return alone;
  return cardGroupOf(tokens, true);
}

/** How many combatants or groups would go without a card if `fight` dealt now: none where the deck suffices. */
export function cardsShort(fight: Pick<CardsFight, 'deck' | 'share'>, entries: readonly InitiativeEntry[], tokens: Readonly<Record<string, TokenEntity>>): number {
  return Math.max(0, cardsNeeded(entries, dealGroupOf(fight, entries, tokens)) - fight.deck);
}
