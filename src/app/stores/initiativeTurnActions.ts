/**
 * The actions that run a fight: who has the turn, rounds, sitting a round out, delaying, cards.
 * Spread into the initiative actions (`createInitiativeActions`).
 */

import type { TokenEntity } from '../types';
import type { InitiativeState } from '../types/initiativeTypes';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { clearSittingOut } from '../initiative/rounds';
import { nextSideTurn, previousSideTurn, type SideTurnInputs } from '../initiative/turns';
import { actNow, delayTurn, endDelays, firstTurn, nextOrderTurn, previousOrderTurn } from '../initiative/turnOrder';
import { swapCards } from '../initiative/cardDeal';
import { fightDraws, roundChangesOf, sideInputs, startFight, type FightDraws } from './initiativeFightStart';

/** Entry ids whose combatant is defeated (the card's skull): turns pass them by. */
export type DefeatedCombatants = ReadonlySet<string>;

export interface InitiativeTurnActions {
  /** The next combatant (or side) that acts takes the turn; the `defeated` are passed by. */
  nextTurn: (defeated?: DefeatedCombatants) => void;
  /** The combatant (or side) before that acts takes the turn back; the `defeated` are passed by. */
  previousTurn: (defeated?: DefeatedCombatants) => void;
  /** Starts a fight as `rules` say (in turn order when left out); it keeps that mode until it ends. */
  startCombat: (rules?: InitiativeRules, defeated?: DefeatedCombatants) => void;
  endCombat: () => void;
  /** Whether a combatant sits the running round out. */
  setInitiativeSitsOut: (id: string, sitsOut: boolean) => void;
  /** The combatant delays its turn and waits outside the order (turn order). */
  delayInitiativeTurn: (id: string, defeated?: DefeatedCombatants) => void;
  /** The delayed combatant acts now, before the combatant whose turn it is. */
  actNowInInitiative: (id: string) => void;
  /** Two combatants of a fight by cards swap their cards; the turn stays with the card that had it. */
  swapInitiativeCards: (id: string, withId: string) => void;
}

export interface TurnStoreState {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
}

type ImmerSet = (fn: (draft: TurnStoreState) => void) => void;

const NOBODY: DefeatedCombatants = new Set();

function step(draft: TurnStoreState, defeated: DefeatedCombatants, draws: FightDraws, forward: boolean): void {
  const { initiative } = draft;
  if (initiative.sides) {
    const inputs: SideTurnInputs = sideInputs(draft, defeated, draws.sideRolls);
    if (forward) nextSideTurn(initiative, inputs);
    else previousSideTurn(initiative, inputs);
    return;
  }
  const rounds = roundChangesOf(draft, draws.deck);
  if (forward) nextOrderTurn(initiative, defeated, rounds);
  else previousOrderTurn(initiative, defeated, rounds);
}

/**
 * The turn actions. Chance (a fresh deck, the sides' rolls) is drawn with `random` before each
 * write that may begin a round, so the store's write itself stays free of it.
 */
export function createInitiativeTurnActions(set: ImmerSet, get: () => TurnStoreState, random: () => number): InitiativeTurnActions {
  return {
    nextTurn: (defeated = NOBODY) => {
      const draws = fightDraws(get().initiative, random);
      set((draft) => step(draft, defeated, draws, true));
    },

    previousTurn: (defeated = NOBODY) => {
      const draws = fightDraws(get().initiative, random);
      set((draft) => step(draft, defeated, draws, false));
    },

    startCombat: (rules, defeated = NOBODY) => {
      const draws = fightDraws(get().initiative, random, rules);
      set((draft) => {
        draft.initiative.isActive = true;
        draft.initiative.round = 1;
        draft.initiative.entries.forEach((entry) => { entry.isActive = false; });
        clearSittingOut(draft.initiative);
        endDelays(draft.initiative);
        if (startFight(draft, rules, draws, defeated)) return;
        firstTurn(draft.initiative, defeated);
      });
    },

    endCombat: () => set((draft) => {
      draft.initiative.isActive = false;
      draft.initiative.round = 0;
      draft.initiative.currentIndex = -1;
      draft.initiative.entries.forEach((entry) => { entry.isActive = false; });
      delete draft.initiative.sides;
      delete draft.initiative.cards;
      for (const entry of draft.initiative.entries) delete entry.card;
      clearSittingOut(draft.initiative);
      endDelays(draft.initiative);
    }),

    setInitiativeSitsOut: (id, sitsOut) => set((draft) => {
      const entry = draft.initiative.entries.find((e) => e.id === id);
      if (!entry) return;
      if (sitsOut) entry.sitsOut = true;
      else delete entry.sitsOut;
    }),

    delayInitiativeTurn: (id, defeated = NOBODY) => set((draft) => {
      delayTurn(draft.initiative, id, defeated);
    }),

    actNowInInitiative: (id) => set((draft) => {
      actNow(draft.initiative, id);
    }),

    swapInitiativeCards: (id, withId) => set((draft) => {
      if (draft.initiative.cards) swapCards(draft.initiative, id, withId);
    }),
  };
}
