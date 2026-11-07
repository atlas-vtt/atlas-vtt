/**
 * A fight by cards: the size of the deck, whether it is dealt anew every round, and whether
 * look-alikes share a card. Read, checked and compared here.
 */

import type { InitiativeRules } from '../types/initiativeRulesTypes';

/** A deck of the cards 1 to 10, as a collection without a size of its own deals. */
export const DEFAULT_DECK = 10;
export const MIN_DECK = 2;
export const MAX_DECK = 50;

export type CardParts = Pick<InitiativeRules, 'deck' | 'dealEachRound' | 'lookAlikesShare'>;

export function isDeckSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_DECK && value <= MAX_DECK;
}

/** How many cards the deck of `rules` holds. */
export function deckSize(rules: Pick<InitiativeRules, 'deck'>): number {
  return isDeckSize(rules.deck) ? rules.deck : DEFAULT_DECK;
}

/** The card parts of stored rules: a deck size only where it is one and not the default, switches only where they are on. */
export function cardParts(raw: { deck?: unknown; dealEachRound?: unknown; lookAlikesShare?: unknown }): CardParts {
  return {
    ...(isDeckSize(raw.deck) && raw.deck !== DEFAULT_DECK && { deck: raw.deck }),
    ...(raw.dealEachRound === true && { dealEachRound: true }),
    ...(raw.lookAlikesShare === true && { lookAlikesShare: true }),
  };
}

/** Whether a deck size being edited can be saved. */
export function isCardPartValid(rules: CardParts): boolean {
  return rules.deck === undefined || isDeckSize(rules.deck);
}

/** Whether two rules deal the same deck the same way; an unset size is the default. */
export function sameCardParts(a: CardParts, b: CardParts): boolean {
  return deckSize(a) === deckSize(b)
    && Boolean(a.dealEachRound) === Boolean(b.dealEachRound)
    && Boolean(a.lookAlikesShare) === Boolean(b.lookAlikesShare);
}

/** Whether two rules deal the same deck as typed: a size of 10 typed is not the same as none. */
export function sameTypedCardParts(a: CardParts, b: CardParts): boolean {
  return a.deck === b.deck && sameCardParts(a, b);
}
