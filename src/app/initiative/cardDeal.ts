/**
 * A fight by cards, without the store: every combatant (or every group of look-alikes) is dealt a
 * card from a shuffled deck, the lowest card acts first, two may swap their cards, and a fight
 * that deals every round keeps each round's cards so stepping back and on shows them again.
 */

import type { CardsFight, InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import type { RoundChanges } from './rounds';
import { renumber } from './turnOrder';

/** The group a combatant is dealt with: combatants of one group share a card. */
export type CardGroupOf = (entry: InitiativeEntry) => string;

/** A deck shuffled before the write, and the groups combatants are dealt in. */
export interface CardDealInputs {
  /** The cards in the order they are dealt (`shuffledDeck`). */
  deck: readonly number[];
  groupOf: CardGroupOf;
}

/** The lower card first, a combatant without a card after all others; equal cards keep their order. */
function byCard(a: InitiativeEntry, b: InitiativeEntry): number {
  return (a.card ?? Infinity) - (b.card ?? Infinity);
}

/** Sorts the combatants by their cards; the turn stays with the combatant that has it. */
export function sortByCards(initiative: InitiativeState): void {
  initiative.entries.sort(byCard);
  renumber(initiative.entries);
  const active = initiative.entries.findIndex((entry) => entry.isActive);
  if (active !== -1) initiative.currentIndex = active;
}

/** The combatants by group, in the order of the list. */
function groupsOf(entries: readonly InitiativeEntry[], groupOf: CardGroupOf): InitiativeEntry[][] {
  const groups = new Map<string, InitiativeEntry[]>();
  for (const entry of entries) {
    const key = groupOf(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()];
}

/** How many groups `groupOf` makes of the combatants: the cards a deal needs. */
export function cardsNeeded(entries: readonly InitiativeEntry[], groupOf: CardGroupOf): number {
  return groupsOf(entries, groupOf).length;
}

/**
 * Deals cards: a group whose members hold none takes the next card of the deck that nobody holds,
 * a member joining a group that holds one takes that card. A card held is never taken or changed
 * (a group that was dealt before its members shared keeps their cards); `anew` takes every card
 * back first. Where the deck runs out, the combatants left get none and act after all others.
 */
export function dealCards(initiative: InitiativeState, { deck, groupOf }: CardDealInputs, anew: boolean): void {
  if (anew) for (const entry of initiative.entries) delete entry.card;
  const held = new Set(initiative.entries.flatMap((entry) => (entry.card === undefined ? [] : [entry.card])));
  const free = deck.filter((card) => !held.has(card));
  for (const group of groupsOf(initiative.entries, groupOf)) {
    const waiting = group.filter((entry) => entry.card === undefined);
    if (waiting.length === 0) continue;
    const card = group.find((entry) => entry.card !== undefined)?.card ?? free.shift();
    if (card === undefined) continue;
    for (const entry of waiting) entry.card = card;
  }
  sortByCards(initiative);
}

/**
 * Two combatants swap their cards (and so their places), each with every combatant sharing its
 * card. In a running fight the turn stays with the card that had it: whoever holds it now acts,
 * so a combatant waiting on its turn hands it to the one it swapped with.
 */
export function swapCards(initiative: InitiativeState, id: string, withId: string): void {
  const { entries } = initiative;
  const a = entries.find((entry) => entry.id === id)?.card;
  const b = entries.find((entry) => entry.id === withId)?.card;
  if (a === undefined || b === undefined || a === b) return;
  const turnCard = entries.find((entry) => entry.isActive)?.card;
  for (const entry of entries) {
    if (entry.card === a) entry.card = b;
    else if (entry.card === b) entry.card = a;
  }
  sortByCards(initiative);
  if (!initiative.isActive || turnCard === undefined || (turnCard !== a && turnCard !== b)) return;
  const holder = entries.findIndex((entry) => entry.card === turnCard);
  entries.forEach((entry, index) => { entry.isActive = index === holder; });
  initiative.currentIndex = holder;
}

/** Every combatant's card, by entry id. */
function cardsNow(entries: readonly InitiativeEntry[]): Record<string, number> {
  return Object.fromEntries(entries.flatMap((entry) => (entry.card === undefined ? [] : [[entry.id, entry.card]])));
}

/** The kept cards of `round` on the combatants; a combatant the round did not know gets none. */
function takeUp(initiative: InitiativeState, kept: Record<string, number>): void {
  for (const entry of initiative.entries) {
    const card = kept[entry.id];
    if (card === undefined) delete entry.card;
    else entry.card = card;
  }
}

/**
 * What a fight by cards does at a round's boundary. Every round dealt anew: the round left keeps
 * its cards, and the round entered takes up its own kept ones or is dealt anew. Dealt once: only
 * newcomers are dealt a card as a round begins. Either way the order follows the cards.
 */
export function cardRounds(fight: CardsFight, inputs: CardDealInputs): RoundChanges {
  const keep = (initiative: InitiativeState, round: number): void => {
    fight.kept = { ...fight.kept, [round]: cardsNow(initiative.entries) };
  };
  return {
    began: (initiative) => {
      if (!fight.eachRound) return dealCards(initiative, inputs, false);
      keep(initiative, initiative.round - 1);
      const kept = fight.kept?.[initiative.round];
      if (kept) takeUp(initiative, kept);
      dealCards(initiative, inputs, !kept);
    },
    steppedBack: (initiative) => {
      if (!fight.eachRound) return;
      keep(initiative, initiative.round + 1);
      takeUp(initiative, fight.kept?.[initiative.round] ?? {});
      sortByCards(initiative);
    },
  };
}
