/**
 * What a fight reads besides its own state, and how it starts as its rules say: the map's rules
 * say which combatants are defeated, and chance gives a shuffled deck for a fight by cards and a
 * roll for every side where the sides roll for their order.
 */

import { deckSize } from '../gameSystems/initiativeCardRules';
import { firstBuiltInSide, inSideOrder, sidesOfRules } from '../gameSystems/initiativeSideRules';
import { cardRounds, dealCards } from '../initiative/cardDeal';
import { dealGroupOf } from '../initiative/cardGroups';
import { defeatedCombatants } from '../initiative/defeated';
import { shuffledDeck } from '../initiative/initiativeDice';
import { NO_ROUND_CHANGES } from '../initiative/rounds';
import { enterSideRound, fightSideIds, rollSides, sidesByRoll } from '../initiative/sideOrder';
import type { OrderTurns } from '../initiative/turnOrder';
import { firstActingSide, type SideTurnInputs } from '../initiative/turns';
import type { RulesLookup } from '../gameSystems/mapRules';
import { mapResources } from '../resources/collectionResources';
import type { InitiativeRules, SideId } from '../types/initiativeRulesTypes';
import type { CardsFight, InitiativeState, SidesFight } from '../types/initiativeTypes';
import type { TokenEntity } from '../types';
import { entrySide } from '../initiative/party';

/** What a store's fight is bound to once: where its map's rules are looked up, and chance. */
export interface FightBinding {
  /** The map's rules: the resources they track say which combatants are defeated (`mapResources`). */
  readonly rules: RulesLookup;
  /** Shuffles a fresh deck and rolls for the sides. */
  readonly random: () => number;
}

/** What a write to a fight reads before it runs: who is defeated, and the chance a round it begins draws. */
export interface FightReading {
  /** The entry ids of the defeated combatants. */
  readonly defeated: ReadonlySet<string>;
  /** The deck in the order it deals; empty outside a fight by cards. */
  readonly deck: readonly number[];
  /** A roll for every side, where the sides roll for their order. */
  readonly sideRolls?: Record<SideId, number>;
}

interface FightDraft {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
}

/** A store's fight as a write reads it: its map's path tells whose rules it plays by. */
interface FightState extends FightDraft {
  mapPath?: string | null | undefined;
}

/** What chance gives a fight starting as `rules` say, or, without them, the running fight. */
function draws(initiative: InitiativeState, random: () => number, rules?: InitiativeRules): Omit<FightReading, 'defeated'> {
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

/** Reads the fight of `state` before a write: a fight starting as `rules` say, or, without them, the running one. */
export function readFight(state: FightState, binding: FightBinding, rules?: InitiativeRules): FightReading {
  const { initiative, objects } = state;
  return {
    defeated: defeatedCombatants(initiative.entries, objects.tokens, mapResources(binding.rules, state.mapPath)),
    ...draws(initiative, binding.random, rules),
  };
}

/** How the turns of a fight by sides read its combatants; a round that begins takes the rolls `reading` drew. */
export function sideInputs(draft: FightDraft, reading: FightReading): SideTurnInputs {
  const known = draft.initiative.sides ? fightSideIds(draft.initiative.sides) : undefined;
  const fresh = reading.sideRolls;
  return { sideOf: (entry) => entrySide(entry, draft.objects.tokens, known), defeated: reading.defeated, ...(fresh && { fresh }) };
}

/** How the turns of a fight in turn order or by cards read it; a fight by cards deals from the deck `reading` drew. */
export function orderTurns(draft: FightDraft, reading: FightReading): OrderTurns {
  const { cards } = draft.initiative;
  const rounds = cards ? cardRounds(cards, { deck: reading.deck, groupOf: dealGroupOf(cards, draft.initiative.entries, draft.objects.tokens) }) : NO_ROUND_CHANGES;
  return { defeated: reading.defeated, rounds };
}

function startSides(draft: FightDraft, rules: InitiativeRules, reading: FightReading): void {
  const sides = inSideOrder(sidesOfRules(rules), draft.initiative.sideOrder);
  const openingRolls = rules.sideRollOnce ? reading.sideRolls : undefined;
  const order = openingRolls ? sidesByRoll(sides, openingRolls) : sides;
  const first = firstBuiltInSide(order);
  // A rolled fight keeps its own order. Only a fight that rolls every round keeps the dice formula.
  const fight: SidesFight = {
    first,
    active: first,
    ...((rules.sides || rules.sideRoll || draft.initiative.sideOrder) && { order }),
    ...(rules.sideRoll && !rules.sideRollOnce && { roll: rules.sideRoll }),
    ...(openingRolls && { rolls: { 1: openingRolls } }),
  };
  enterSideRound(fight, 1, reading.sideRolls);
  draft.initiative.sides = fight;
  // The turn goes to the first side that acts: a named side without combatants takes none
  const live = draft.initiative.sides;
  live.active = firstActingSide(draft.initiative, live, sideInputs(draft, reading));
  // By sides the turn belongs to a side, never to one combatant
  draft.initiative.currentIndex = -1;
}

function startCards(draft: FightDraft, rules: InitiativeRules, reading: FightReading): void {
  const fight: CardsFight = {
    deck: deckSize(rules),
    ...(rules.dealEachRound && { eachRound: true }),
    ...(rules.lookAlikesShare && { share: true }),
  };
  draft.initiative.cards = fight;
  dealCards(draft.initiative, { deck: reading.deck, groupOf: dealGroupOf(fight, draft.initiative.entries, draft.objects.tokens) }, true);
}

/**
 * Sets the fight up as `rules` say, on a draft whose fight has just begun. Returns whether the turn
 * is given (by sides it belongs to a side); otherwise the first combatant in order takes it.
 */
export function startFight(draft: FightDraft, rules: InitiativeRules | undefined, reading: FightReading): boolean {
  const { initiative } = draft;
  delete initiative.sides;
  delete initiative.cards;
  for (const entry of initiative.entries) delete entry.card;
  if (rules?.mode === 'sides') {
    startSides(draft, rules, reading);
    return true;
  }
  if (rules?.mode === 'cards') startCards(draft, rules, reading);
  return false;
}
