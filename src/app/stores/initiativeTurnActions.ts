/**
 * The actions that run a fight: who has the turn, rounds, sitting a round out, delaying, cards.
 * Bound once to the map's rules, which say who is defeated, and to chance; commands take ids.
 * Spread into the initiative actions (`createInitiativeActions`).
 */

import type { TokenEntity } from '../types';
import type { InitiativeState } from '../types/initiativeTypes';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { clearSittingOut } from '../initiative/rounds';
import { nextSideTurn, previousSideTurn } from '../initiative/turns';
import { actNow, delayTurn, endDelays, firstTurn, nextOrderTurn, previousOrderTurn, removeCombatant } from '../initiative/turnOrder';
import { swapCards } from '../initiative/cardDeal';
import { orderTurns, readFight, sideInputs, startFight, type FightBinding, type FightReading } from './initiativeFightStart';
import { clearCombatantConditions, setCombatantCondition } from '../initiative/combatantConditions';

/** No fight runs any more: no turn, round, sides or cards, nobody sitting out or delayed. */
function endFight(initiative: InitiativeState): void {
  initiative.isActive = false;
  initiative.round = 0;
  initiative.entries.forEach((entry) => { entry.isActive = false; });
  delete initiative.sides;
  delete initiative.cards;
  for (const entry of initiative.entries) delete entry.card;
  clearSittingOut(initiative);
  endDelays(initiative);
}

export interface InitiativeTurnActions {
  /** The next combatant (or side) that acts takes the turn; defeated combatants (the card's skull) are passed by. */
  nextTurn: () => void;
  /** The combatant (or side) before that acts takes the turn back; defeated combatants are passed by. */
  previousTurn: () => void;
  /** Starts a fight as `rules` say (in turn order when left out); it keeps that mode until it ends. */
  startCombat: (rules?: InitiativeRules) => void;
  endCombat: () => void;
  /** Ends the fight and takes every combatant's number and conditions away: they stay in the tracker, waiting for a new roll. */
  resetInitiativeNumbers: () => void;
  /** Whether a combatant sits the running round out. */
  setInitiativeSitsOut: (id: string, sitsOut: boolean) => void;
  /** The combatant delays its turn and waits outside the order (turn order or by cards); had it the turn, the turn passes on as Next turn would. */
  delayInitiativeTurn: (id: string) => void;
  /** The delayed combatant acts now, before the combatant whose turn it is. */
  actNowInInitiative: (id: string) => void;
  /** Two combatants of a fight by cards swap their cards; the turn stays with the card that had it. */
  swapInitiativeCards: (id: string, withId: string) => void;
  /** Gives a combatant a condition or takes it away: on its token, or on an entry without one. */
  setCombatantCondition: (id: string, conditionId: string, on: boolean) => void;
  /** Removes a combatant; had it the turn in a fight in turn order, the turn passes on as Next turn would. */
  removeFromInitiative: (id: string) => void;
}

export interface TurnStoreState {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
  /** The map the fight is on, whose rules say who is defeated. */
  mapPath?: string | null | undefined;
  /** How many fights the view has started (`ViewState.fightsStarted`); a store without the count leaves it out. */
  fightsStarted?: number | undefined;
}

type ImmerSet = (fn: (draft: TurnStoreState) => void) => void;

function move(draft: TurnStoreState, reading: FightReading, forward: boolean): void {
  const { initiative } = draft;
  if (initiative.sides) {
    const inputs = sideInputs(draft, reading);
    if (forward) nextSideTurn(initiative, inputs);
    else previousSideTurn(initiative, inputs);
    return;
  }
  const turns = orderTurns(draft, reading);
  if (forward) nextOrderTurn(initiative, turns);
  else previousOrderTurn(initiative, turns);
}

/**
 * The turn actions. Who is defeated, and chance (a fresh deck, the sides' rolls), are read before
 * each write that may move the turn (`readFight`), so the store's write itself stays free of chance.
 */
export function createInitiativeTurnActions(set: ImmerSet, get: () => TurnStoreState, binding: FightBinding): InitiativeTurnActions {
  return {
    nextTurn: () => {
      const reading = readFight(get(), binding);
      set((draft) => move(draft, reading, true));
    },

    previousTurn: () => {
      const reading = readFight(get(), binding);
      set((draft) => move(draft, reading, false));
    },

    startCombat: (rules) => {
      const reading = readFight(get(), binding, rules);
      set((draft) => {
        draft.initiative.isActive = true;
        draft.initiative.round = 1;
        // Another fight: what tokens moved in the turns of the last one counts for none of its turns.
        draft.fightsStarted = (draft.fightsStarted ?? 0) + 1;
        draft.initiative.entries.forEach((entry) => { entry.isActive = false; });
        clearSittingOut(draft.initiative);
        endDelays(draft.initiative);
        if (startFight(draft, rules, reading)) return;
        firstTurn(draft.initiative, reading.defeated);
      });
    },

    endCombat: () => set((draft) => {
      endFight(draft.initiative);
    }),

    resetInitiativeNumbers: () => set((draft) => {
      endFight(draft.initiative);
      for (const entry of draft.initiative.entries) {
        entry.initiative = 0;
        entry.awaitingInitiative = true;
        delete entry.rolledModifier;
        delete entry.tieBreak;
      }
      clearCombatantConditions(draft);
    }),

    setInitiativeSitsOut: (id, sitsOut) => set((draft) => {
      const entry = draft.initiative.entries.find((e) => e.id === id);
      if (!entry) return;
      if (sitsOut) entry.sitsOut = true;
      else delete entry.sitsOut;
    }),

    delayInitiativeTurn: (id) => {
      const reading = readFight(get(), binding);
      set((draft) => delayTurn(draft.initiative, id, orderTurns(draft, reading)));
    },

    removeFromInitiative: (id) => {
      const reading = readFight(get(), binding);
      set((draft) => removeCombatant(draft.initiative, id, orderTurns(draft, reading)));
    },

    actNowInInitiative: (id) => set((draft) => {
      actNow(draft.initiative, id);
    }),

    swapInitiativeCards: (id, withId) => set((draft) => {
      if (draft.initiative.cards) swapCards(draft.initiative, id, withId);
    }),

    setCombatantCondition: (id, conditionId, on) => set((draft) => setCombatantCondition(draft, id, conditionId, on)),

  };
}
