/**
 * How a fight starts as its rules say, and what chance its rounds draw: a shuffled deck for a
 * fight by cards, a roll for every side where the sides roll for their order.
 */

import { deckSize } from '../gameSystems/initiativeCardRules';
import { firstBuiltInSide, sidesOfRules } from '../gameSystems/initiativeSideRules';
import { cardRounds, dealCards } from '../initiative/cardDeal';
import { dealGroupOf } from '../initiative/cardGroups';
import { shuffledDeck } from '../initiative/initiativeDice';
import type { RoundChanges } from '../initiative/rounds';
import { enterSideRound, fightSideIds, rollSides } from '../initiative/sideOrder';
import { sideOf } from '../initiative/sides';
import { firstActingSide, type SideTurnInputs } from '../initiative/turns';
import type { InitiativeRules, SideId } from '../types/initiativeRulesTypes';
import type { CardsFight, InitiativeState, SidesFight } from '../types/initiativeTypes';
import type { TokenEntity } from '../types';

/** What a fight draws before a write that may begin a round. */
export interface FightDraws {
  /** The deck in the order it deals; empty outside a fight by cards. */
  deck: readonly number[];
  /** A roll for every side, where the sides roll for their order. */
  sideRolls?: Record<SideId, number>;
}

interface FightDraft {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
}

/** The draws for a fight starting as `rules` say, or, without them, for the running fight. */
export function fightDraws(initiative: InitiativeState, random: () => number, rules?: InitiativeRules): FightDraws {
  if (rules) {
    const sideIds = sidesOfRules(rules).map((side) => side.id);
    return {
      deck: rules.mode === 'cards' ? shuffledDeck(deckSize(rules), random) : [],
      ...(rules.mode === 'sides' && rules.sideRoll && { sideRolls: rollSides(sideIds, rules.sideRoll, random) }),
    };
  }
  const { cards, sides } = initiative;
  return {
    deck: cards ? shuffledDeck(cards.deck, random) : [],
    ...(sides?.roll && { sideRolls: rollSides(fightSideIds(sides), sides.roll, random) }),
  };
}

/** How the turns of a fight by sides read its combatants; `fresh` rolls a round that begins takes. */
export function sideInputs(draft: FightDraft, defeated: ReadonlySet<string>, fresh?: Record<SideId, number>): SideTurnInputs {
  const known = draft.initiative.sides ? fightSideIds(draft.initiative.sides) : undefined;
  return { sideOf: (entry) => sideOf(draft.objects.tokens[entry.tokenId], known), defeated, ...(fresh && { fresh }) };
}

/** What a running fight by cards does at a round's boundary, dealing from `deck`; nothing for another fight. */
export function roundChangesOf(draft: FightDraft, deck: readonly number[]): RoundChanges | undefined {
  const { cards } = draft.initiative;
  if (!cards) return undefined;
  return cardRounds(cards, { deck, groupOf: dealGroupOf(cards, draft.initiative.entries, draft.objects.tokens) });
}

function startSides(draft: FightDraft, rules: InitiativeRules, draws: FightDraws, defeated: ReadonlySet<string>): void {
  const order = sidesOfRules(rules);
  const first = firstBuiltInSide(order);
  // A rolled order moves `first` from round to round, so the fight keeps its own list of sides
  const fight: SidesFight = {
    first,
    active: first,
    ...((rules.sides || rules.sideRoll) && { order }),
    ...(rules.sideRoll && { roll: rules.sideRoll }),
  };
  enterSideRound(fight, 1, draws.sideRolls);
  draft.initiative.sides = fight;
  // The turn goes to the first side that acts: a named side without combatants takes none
  const live = draft.initiative.sides;
  live.active = firstActingSide(draft.initiative, live, sideInputs(draft, defeated));
  // By sides the turn belongs to a side, never to one combatant
  draft.initiative.currentIndex = -1;
}

function startCards(draft: FightDraft, rules: InitiativeRules, draws: FightDraws): void {
  const fight: CardsFight = {
    deck: deckSize(rules),
    ...(rules.dealEachRound && { eachRound: true }),
    ...(rules.lookAlikesShare && { share: true }),
  };
  draft.initiative.cards = fight;
  dealCards(draft.initiative, { deck: draws.deck, groupOf: dealGroupOf(fight, draft.initiative.entries, draft.objects.tokens) }, true);
}

/**
 * Sets the fight up as `rules` say, on a draft whose fight has just begun. Returns whether the turn
 * is given (by sides it belongs to a side); otherwise the first combatant in order takes it.
 */
export function startFight(draft: FightDraft, rules: InitiativeRules | undefined, draws: FightDraws, defeated: ReadonlySet<string>): boolean {
  const { initiative } = draft;
  delete initiative.sides;
  delete initiative.cards;
  for (const entry of initiative.entries) delete entry.card;
  if (rules?.mode === 'sides') {
    startSides(draft, rules, draws, defeated);
    return true;
  }
  if (rules?.mode === 'cards') startCards(draft, rules, draws);
  return false;
}
