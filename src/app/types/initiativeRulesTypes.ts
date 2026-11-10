/**
 * How a collection runs a fight in the initiative tracker.
 *
 * - `turn-order`: every combatant has a number, rolled or typed, and they act from the highest down (D&D, Pathfinder).
 * - `sides`: the sides act as blocks, in any order within one; their order is fixed or rolled every round (Cairn, B/X).
 * - `cards`: every combatant is dealt a card from a numbered deck, and the lowest card acts first.
 */
export type InitiativeMode = 'turn-order' | 'sides' | 'cards';

/** The two sides every collection has. */
export type InitiativeSide = 'players' | 'opponents';

/** A side's id: one of the two built-in sides, or the id of a side the collection named. */
export type SideId = string;

/** A side in a collection's list: the built-in ones carry no name (they are translated), a named one its own. */
export interface SideRef {
  id: SideId;
  name?: string;
}

/** A statblock field that gives an initiative modifier. */
export interface InitiativeModifierSource {
  /** Dotted path, as a resource names its field (`initiative`, `stats.1`). */
  field: string;
  /** The field holds an ability score, whose modifier is the d20 rule's `floor((score - 10) / 2)`. */
  abilityScore?: true;
}

export interface InitiativeRules {
  mode: InitiativeMode;
  /** Turn order: the dice a combatant rolls, one group `NdS` such as `1d20`. */
  roll: string;
  /**
   * Turn order: where a combatant's statblock holds the number added to its roll. Unset, or where
   * the statblock lacks that field, the field its template means as initiative counts.
   */
  modifier?: InitiativeModifierSource;
  /** Read last, where neither the modifier's field nor the template's initiative gives a number (5e: DEX). */
  modifierFallback?: InitiativeModifierSource;
  /**
   * Sides: of the players and the opponents, the side that acts first. Where `sides` is set this
   * is the first of the two in that list, so older versions read the same order.
   */
  firstSide: InitiativeSide;
  /**
   * Sides: every side in the order it acts, the built-in two included; unset, `firstSide` then the
   * other. Set only where the collection names sides of its own or orders them otherwise.
   */
  sides?: SideRef[];
  /** Sides: the dice each side rolls at the start of every round; the highest acts first, equal rolls at once. */
  sideRoll?: string;
  /** Cards: the deck holds the cards 1 to `deck` (unset: 10). */
  deck?: number;
  /** Cards: a new card for everyone at the start of every round; unset, cards are dealt when the fight starts. */
  dealEachRound?: true;
  /** Cards: combatants that are not on the players' side and look alike (the same art) share one card. */
  lookAlikesShare?: true;
  /**
   * A creature that joins a scene (placed from the library or an encounter, or added to the tracker
   * beside the map) rolls its hit points from its statblock's hit dice instead of taking their
   * average. Never a player character. Older versions ignore it.
   */
  rollHitPoints?: true;
}
