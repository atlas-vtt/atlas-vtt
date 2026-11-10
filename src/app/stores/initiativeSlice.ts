/**
 * Initiative Tracker State Slice
 * Provides initiative actions that can be spread into the main store
 */

import type { TokenEntity } from '../types';
import type { InitiativeState, InitiativeEntry, InitiativeConfig } from '../types/initiativeTypes';
import { createDefaultInitiativeState } from '../types/initiativeTypes';
import { DEFAULT_INITIATIVE_RULES } from '../gameSystems/initiativeRules';
import { combatantModifier, ownModifier } from '../initiative/initiativeModifier';
import { rollInitiativeDice } from '../initiative/initiativeDice';
import { removeCombatant, renumber } from '../initiative/turnOrder';
import { sortCombatants } from '../initiative/sortCombatants';
import { clearSittingOut } from '../initiative/rounds';
import { createInitiativeTurnActions, type InitiativeTurnActions } from './initiativeTurnActions';
import { fightDraws, roundChangesOf } from './initiativeFightStart';
import { setInitiative } from '../initiative/awaitingInitiative';

/**
 * Initiative slice state interface
 * These fields are added to ViewAtlasState
 */
export interface InitiativeSlice extends InitiativeTurnActions {
  // State
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;

  // Actions
  setInitiativeTrackerOpen: (open: boolean) => void;
  addToInitiative: (entry: Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>) => string;
  /** Removes a combatant; had it the turn in a fight in turn order, the turn passes on, past the `defeated`. */
  removeFromInitiative: (id: string, defeated?: ReadonlySet<string>) => void;
  updateInitiativeEntry: (id: string, updates: Partial<InitiativeEntry>) => void;
  /**
   * Rolls `roll` (the collection's initiative dice; a d20 when left out) for every combatant, adding
   * each one's modifier (`combatantModifier`: its own, else its statblock's from `fromStatblocks`).
   * A statblock's modifier is never written into the entry's `initiativeModifier`; what a roll
   * added is kept as `rolledModifier`, which only breaks ties between equal totals.
   */
  rollAllInitiative: (roll?: string, fromStatblocks?: ReadonlyMap<string, number>) => void;
  rollEntryInitiative: (id: string, roll?: string, fromStatblock?: number | null) => void;
  reorderInitiative: (fromIndex: number, toIndex: number) => void;
  moveToFront: (id: string) => void;
  moveToBack: (id: string) => void;
  /** Removes every combatant and ends the fight. */
  resetInitiative: () => void;
  setInitiativeConfig: (config: Partial<InitiativeConfig>) => void;
}

/**
 * Store state type that the initiative actions need access to
 */
interface InitiativeStoreState {
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;
  objects: {
    tokens: Record<string, TokenEntity>;
  };
}

/**
 * Immer set function type
 */
type ImmerSet = (fn: (draft: InitiativeStoreState) => void) => void;

/**
 * Create the initial initiative state
 */
export function createInitialInitiativeState(): Pick<InitiativeSlice, 'initiative' | 'initiativeTrackerOpen'> {
  return {
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
  };
}

/**
 * Generate a unique initiative entry ID
 */
function generateInitiativeId(): string {
  return `init_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** A combatant's roll: the total and the modifier it added. */
interface RolledTotal {
  total: number;
  modifier: number;
}

/** Writes a roll onto its combatant; the modifier is kept for breaking ties only. */
function applyRoll(entry: InitiativeEntry, { total, modifier }: RolledTotal): void {
  setInitiative(entry, total);
  entry.rolledModifier = modifier;
  delete entry.tieBreak;
}

/** What a combatant rolls where the caller names no dice. */
const DEFAULT_ROLL = DEFAULT_INITIATIVE_RULES.roll;

/**
 * Creates the initiative actions for the store
 * These are spread into the main store's immer state creator
 * @param set - The immer set function from the store
 * @param viewId - The view ID for logging purposes
 */
export function createInitiativeActions(
  set: ImmerSet,
  viewId: string,
  get: () => InitiativeStoreState,
  random: () => number,
): Omit<InitiativeSlice, 'initiative' | 'initiativeTrackerOpen'> {
  return {
    ...createInitiativeTurnActions(set, get, random),

    setInitiativeTrackerOpen: (open) => set((draft) => {
      draft.initiativeTrackerOpen = open;
    }),

    addToInitiative: (entry) => {
      const id = generateInitiativeId();
      set((draft) => {
        const order = draft.initiative.entries.length;
        const newEntry: InitiativeEntry = {
          ...entry,
          id,
          order,
          isActive: draft.initiative.entries.length === 0,
        };
        draft.initiative.entries.push(newEntry);
      });
      return id;
    },

    removeFromInitiative: (id, defeated = new Set()) => {
      const { deck } = fightDraws(get().initiative, random);
      set((draft) => {
        removeCombatant(draft.initiative, id, defeated, roundChangesOf(draft, deck));
      });
    },

    updateInitiativeEntry: (id, updates) => set((draft) => {
      const entry = draft.initiative.entries.find(e => e.id === id);
      if (entry) {
        const initiativeChanged = updates.initiative !== undefined && updates.initiative !== entry.initiative;
        const modifierChanged = updates.initiativeModifier !== undefined && updates.initiativeModifier !== entry.initiativeModifier;
        Object.assign(entry, updates);
        if (updates.initiative !== undefined) setInitiative(entry, updates.initiative);
        // A number or modifier of its own replaces where Act Now placed it
        if (initiativeChanged || modifierChanged) delete entry.tieBreak;

        // Re-sort if initiative value changed and autoSort is enabled
        if (initiativeChanged && draft.initiative.config.autoSort) sortCombatants(draft.initiative);
      }
    }),

    rollAllInitiative: (roll = DEFAULT_ROLL, fromStatblocks) => {
      const rolls = new Map(get().initiative.entries.map((entry): [string, RolledTotal] => {
        const modifier = combatantModifier(ownModifier(entry), fromStatblocks?.get(entry.id));
        return [entry.id, { total: rollInitiativeDice(roll, random) + modifier, modifier }];
      }));
      set((draft) => {
        for (const entry of draft.initiative.entries) {
          const rolled = rolls.get(entry.id);
          if (rolled) applyRoll(entry, rolled);
        }
        if (draft.initiative.config.autoSort) sortCombatants(draft.initiative);
      });
    },

    rollEntryInitiative: (id, roll = DEFAULT_ROLL, fromStatblock) => {
      const entry = get().initiative.entries.find(e => e.id === id);
      if (!entry) return;
      const modifier = combatantModifier(ownModifier(entry), fromStatblock);
      const rolled = { total: rollInitiativeDice(roll, random) + modifier, modifier };
      set((draft) => {
        const current = draft.initiative.entries.find(e => e.id === id);
        if (current) applyRoll(current, rolled);
        if (draft.initiative.config.autoSort) sortCombatants(draft.initiative);
      });
    },

    reorderInitiative: (fromIndex, toIndex) => set((draft) => {
      const { entries } = draft.initiative;
      if (fromIndex < 0 || fromIndex >= entries.length) return;
      if (toIndex < 0 || toIndex >= entries.length) return;

      const [movedEntry] = entries.splice(fromIndex, 1);
      if (!movedEntry) return;

      entries.splice(toIndex, 0, movedEntry);
      renumber(entries);

      // Update currentIndex if the moved entry was active
      if (movedEntry.isActive) {
        draft.initiative.currentIndex = toIndex;
      }
    }),

    moveToFront: (id) => set((draft) => {
      const index = draft.initiative.entries.findIndex(e => e.id === id);
      if (index <= 0) return;

      const [entry] = draft.initiative.entries.splice(index, 1);
      if (!entry) return;

      draft.initiative.entries.unshift(entry);
      renumber(draft.initiative.entries);

      if (entry.isActive) {
        draft.initiative.currentIndex = 0;
      }
    }),

    moveToBack: (id) => set((draft) => {
      const { entries } = draft.initiative;
      const index = entries.findIndex(e => e.id === id);
      if (index < 0 || index >= entries.length - 1) return;

      const [entry] = entries.splice(index, 1);
      if (!entry) return;

      entries.push(entry);
      renumber(entries);

      if (entry.isActive) {
        draft.initiative.currentIndex = entries.length - 1;
      }
    }),

    resetInitiative: () => set((draft) => {
      draft.initiative.entries = [];
      draft.initiative.isActive = false;
      draft.initiative.round = 0;
      draft.initiative.currentIndex = -1;
      delete draft.initiative.sides;
      delete draft.initiative.cards;
      clearSittingOut(draft.initiative);
    }),

    setInitiativeConfig: (config) => set((draft) => {
      draft.initiative.config = { ...draft.initiative.config, ...config };
    }),
  };
}
