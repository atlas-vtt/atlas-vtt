/**
 * Initiative Tracker Types
 * Baldur's Gate 3-inspired initiative system for combat tracking
 */

import type { InitiativeSide, SideId, SideRef } from './initiativeRulesTypes';

/**
 * Configuration for the initiative tracker
 */
export interface InitiativeConfig {
  /** Whether to auto-sort entries by initiative value after rolling */
  autoSort: boolean;
}

/**
 * A single entry in the initiative tracker
 */
export interface InitiativeEntry {
  /** Unique identifier for this entry */
  id: string;

  /** Reference to the token on the map */
  tokenId: string;

  /** Display name */
  name: string;

  /** Rolled initiative value (after modifiers) */
  initiative: number;

  /**
   * Added and not yet rolled or typed: `initiative` holds 0, which the tracker shows as an empty
   * slot. Any write of `initiative` removes it (`setInitiative`); older versions leave it alone.
   */
  awaitingInitiative?: true;

  /**
   * The GM's own modifier, added to every roll (`ownModifier`). Every version writes it, 0 where
   * there is none, and older ones add it to their rolls.
   */
  initiativeModifier: number;

  /** `initiativeModifier` was set in the edit popup, so a 0 there is the GM's too; `undefined` clears it when patched. */
  modifierByHand?: true | undefined;

  /** Path to token image for avatar display */
  imagePath: string;

  /** Path to linked statblock note (for CMD+hover preview); `undefined` clears it when patched */
  statblockPath?: string | undefined;

  /** Whether this entry has the current turn */
  isActive: boolean;

  /** Whether this is an NPC (vs player character) */
  isNPC: boolean;

  /** Order in the initiative list (for manual reordering) */
  order: number;

  /** Does not act in the running round (Cairn: a failed DEX save in round 1); cleared when the round ends. */
  sitsOut?: boolean;

  /**
   * Delayed its turn in a fight in turn order: it waits outside the order, and turns pass it by,
   * until it acts again (`actNow`). Older versions read the entry at its place.
   */
  delayed?: true;

  /**
   * The modifier the last roll added (the GM's own, else the statblock's). It only breaks ties
   * between equal totals and is never added to a roll; older versions ignore it.
   */
  rolledModifier?: number;

  /**
   * Set by Act Now: the tie-break of the combatant it acted before, with whose number it ties, so
   * that a later sort keeps it right before that one. A roll or an edit of its own number or
   * modifier clears it; older versions ignore it.
   */
  tieBreak?: number;

  /**
   * The card dealt to the combatant in a fight by cards (`InitiativeState.cards`): the lowest acts
   * first, and look-alikes may share one. Older versions ignore it and read the order as it stands.
   */
  card?: number;
}

/** A fight by sides as it runs: which side has the turn, and in what order the sides act. */
export interface SidesFight {
  /** Of the players and the opponents, the side that acts first; what older versions read. */
  first: InitiativeSide;
  /** The side whose turn it is; where sides act at once (equal rolls), any one of them. */
  active: SideId;
  /**
   * Every side in the order it acts, copied from the rules as the fight started. Unset, `first`
   * then the other: set only where the collection names sides of its own or orders them otherwise.
   */
  order?: SideRef[];
  /** The dice each side rolls at the start of every round for the order: the highest first, equal rolls at once. */
  roll?: string;
  /** The rolls of each round, by round; stepping back into a round shows its rolls again. */
  rolls?: Record<string, Record<SideId, number>>;
}

/** A fight by cards as it runs: the deck it deals, and the cards of the rounds it left. */
export interface CardsFight {
  /** The deck holds the cards 1 to `deck`. */
  deck: number;
  /** Every round deals anew; otherwise cards are dealt as the fight starts, and to newcomers. */
  eachRound?: true;
  /** Look-alikes not on the players' side share a card. */
  share?: true;
  /** Each round's cards as the round was left, by round and entry id: stepping back or on into a round takes them up again. */
  kept?: Record<string, Record<string, number>>;
}

/**
 * Full state for the initiative tracker
 */
export interface InitiativeState {
  /** All entries in the initiative order */
  entries: InitiativeEntry[];

  /** Index of the currently active entry */
  currentIndex: number;

  /** Current combat round number */
  round: number;

  /** Whether combat is currently active */
  isActive: boolean;

  /** Configuration for initiative calculation */
  config: InitiativeConfig;

  /**
   * Set while a fight runs by sides: the side that acts first in a round and the one whose
   * turn it is. A fight keeps the mode it was started in, whatever the collection's rules say since.
   */
  sides?: SidesFight;

  /** Set while a fight runs by cards; a fight keeps the mode it was started in. */
  cards?: CardsFight;

  /**
   * The combatants each round's start cleared `sitsOut` of, by that round, so that stepping back
   * over the start puts their marks back. Only rounds that cleared something are kept.
   */
  satOut?: Record<string, string[]>;
}

/**
 * Default configuration for initiative
 */
export const DEFAULT_INITIATIVE_CONFIG: InitiativeConfig = {
  autoSort: true,
};

/**
 * Default empty initiative state
 */
export const createDefaultInitiativeState = (): InitiativeState => ({
  entries: [],
  currentIndex: -1,
  round: 0,
  isActive: false,
  config: { ...DEFAULT_INITIATIVE_CONFIG },
});
