/**
 * Initiative Tracker State Slice
 * Provides initiative actions that can be spread into the main store
 */

import type { TokenEntity } from '../types';
import type { InitiativeState, InitiativeEntry, InitiativeConfig } from '../types/initiativeTypes';
import { createDefaultInitiativeState } from '../types/initiativeTypes';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { DEFAULT_INITIATIVE_RULES } from '../gameSystems/initiativeRules';
import { clearSittingOut, nextSideTurn, previousSideTurn, rollInitiativeDice } from '../initiative/turns';

/**
 * Initiative slice state interface
 * These fields are added to ViewAtlasState
 */
export interface InitiativeSlice {
  // State
  initiative: InitiativeState;
  initiativeTrackerOpen: boolean;

  // Actions
  setInitiativeTrackerOpen: (open: boolean) => void;
  addToInitiative: (entry: Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>) => string;
  removeFromInitiative: (id: string) => void;
  updateInitiativeEntry: (id: string, updates: Partial<InitiativeEntry>) => void;
  /** Rolls `roll` (the collection's initiative dice; a d20 when left out) for every combatant. */
  rollAllInitiative: (roll?: string) => void;
  rollEntryInitiative: (id: string, roll?: string) => void;
  nextTurn: () => void;
  previousTurn: () => void;
  reorderInitiative: (fromIndex: number, toIndex: number) => void;
  moveToFront: (id: string) => void;
  moveToBack: (id: string) => void;
  /** Starts a fight as `rules` say (in turn order when left out); it keeps that mode until it ends. */
  startCombat: (rules?: InitiativeRules) => void;
  endCombat: () => void;
  /** Whether a combatant sits the running round out. */
  setInitiativeSitsOut: (id: string, sitsOut: boolean) => void;
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

/** What a combatant rolls where the caller names no dice. */
const DEFAULT_ROLL = DEFAULT_INITIATIVE_RULES.roll;

/**
 * Update order indices for all entries after a modification
 */
function updateEntryOrders(entries: InitiativeEntry[]): void {
  entries.forEach((entry, index) => {
    entry.order = index;
  });
}

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

    removeFromInitiative: (id) => set((draft) => {
      const index = draft.initiative.entries.findIndex(e => e.id === id);
      if (index === -1) return;

      const wasActive = draft.initiative.entries[index]!.isActive;
      draft.initiative.entries.splice(index, 1);

      updateEntryOrders(draft.initiative.entries);

      // If removed entry was active, activate the next or previous entry
      if (wasActive && draft.initiative.entries.length > 0) {
        const newActiveIndex = Math.min(index, draft.initiative.entries.length - 1);
        draft.initiative.entries[newActiveIndex]!.isActive = true;
        draft.initiative.currentIndex = newActiveIndex;
      }

    }),

    updateInitiativeEntry: (id, updates) => set((draft) => {
      const entry = draft.initiative.entries.find(e => e.id === id);
      if (entry) {
        const initiativeChanged = updates.initiative !== undefined && updates.initiative !== entry.initiative;
        Object.assign(entry, updates);

        // Re-sort if initiative value changed and autoSort is enabled
        if (initiativeChanged && draft.initiative.config.autoSort) {
          draft.initiative.entries.sort((a, b) => b.initiative - a.initiative);
          updateEntryOrders(draft.initiative.entries);
        }
      }
    }),

    rollAllInitiative: (roll = DEFAULT_ROLL) => {
      const totals = new Map(get().initiative.entries.map(entry => [
        entry.id, rollInitiativeDice(roll, random) + entry.initiativeModifier,
      ]));
      set((draft) => {
        for (const entry of draft.initiative.entries) {
          const total = totals.get(entry.id);
          if (total !== undefined) entry.initiative = total;
        }
        if (draft.initiative.config.autoSort) {
          draft.initiative.entries.sort((a, b) => b.initiative - a.initiative);
          updateEntryOrders(draft.initiative.entries);
        }
      });
    },

    rollEntryInitiative: (id, roll = DEFAULT_ROLL) => {
      const entry = get().initiative.entries.find(e => e.id === id);
      if (!entry) return;
      const total = rollInitiativeDice(roll, random) + entry.initiativeModifier;
      set((draft) => {
        const current = draft.initiative.entries.find(e => e.id === id);
        if (current) current.initiative = total;
      });
    },

    nextTurn: () => set((draft) => {
      if (draft.initiative.sides) return nextSideTurn(draft.initiative);
      if (draft.initiative.entries.length === 0) return;

      // Deactivate current entry
      const currentEntry = draft.initiative.entries.find(e => e.isActive);
      if (currentEntry) {
        currentEntry.isActive = false;
      }

      // Find next entry (wrap around)
      let nextIndex = draft.initiative.currentIndex + 1;
      if (nextIndex >= draft.initiative.entries.length) {
        nextIndex = 0;
        draft.initiative.round++;
      }

      draft.initiative.currentIndex = nextIndex;
      const nextEntry = draft.initiative.entries[nextIndex];
      if (nextEntry) {
        nextEntry.isActive = true;
      }

    }),

    previousTurn: () => set((draft) => {
      if (draft.initiative.sides) return previousSideTurn(draft.initiative);
      if (draft.initiative.entries.length === 0) return;

      // Deactivate current entry
      const currentEntry = draft.initiative.entries.find(e => e.isActive);
      if (currentEntry) {
        currentEntry.isActive = false;
      }

      // Find previous entry (wrap around)
      let prevIndex = draft.initiative.currentIndex - 1;
      if (prevIndex < 0) {
        prevIndex = draft.initiative.entries.length - 1;
        if (draft.initiative.round > 1) {
          draft.initiative.round--;
        }
      }

      draft.initiative.currentIndex = prevIndex;
      const prevEntry = draft.initiative.entries[prevIndex];
      if (prevEntry) {
        prevEntry.isActive = true;
      }

    }),

    reorderInitiative: (fromIndex, toIndex) => set((draft) => {
      const { entries } = draft.initiative;
      if (fromIndex < 0 || fromIndex >= entries.length) return;
      if (toIndex < 0 || toIndex >= entries.length) return;

      const [movedEntry] = entries.splice(fromIndex, 1);
      if (!movedEntry) return;

      entries.splice(toIndex, 0, movedEntry);
      updateEntryOrders(entries);

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
      updateEntryOrders(draft.initiative.entries);

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
      updateEntryOrders(entries);

      if (entry.isActive) {
        draft.initiative.currentIndex = entries.length - 1;
      }
    }),

    startCombat: (rules) => set((draft) => {
      draft.initiative.isActive = true;
      draft.initiative.round = 1;
      draft.initiative.entries.forEach(e => e.isActive = false);
      clearSittingOut(draft.initiative);

      // By sides the turn belongs to a side, never to one combatant
      if (rules?.mode === 'sides') {
        draft.initiative.sides = { first: rules.firstSide, active: rules.firstSide };
        draft.initiative.currentIndex = -1;
        return;
      }

      delete draft.initiative.sides;
      draft.initiative.currentIndex = 0;
      if (draft.initiative.entries.length > 0) {
        draft.initiative.entries[0]!.isActive = true;
      }
    }),

    endCombat: () => set((draft) => {
      draft.initiative.isActive = false;
      draft.initiative.round = 0;
      draft.initiative.currentIndex = -1;

      // Clear active state from all entries
      draft.initiative.entries.forEach(e => e.isActive = false);
      delete draft.initiative.sides;
      clearSittingOut(draft.initiative);
    }),

    setInitiativeSitsOut: (id, sitsOut) => set((draft) => {
      const entry = draft.initiative.entries.find(e => e.id === id);
      if (!entry) return;
      if (sitsOut) entry.sitsOut = true;
      else delete entry.sitsOut;
    }),

    resetInitiative: () => set((draft) => {
      draft.initiative.entries = [];
      draft.initiative.isActive = false;
      draft.initiative.round = 0;
      draft.initiative.currentIndex = -1;
      delete draft.initiative.sides;
    }),

    setInitiativeConfig: (config) => set((draft) => {
      draft.initiative.config = { ...draft.initiative.config, ...config };
    }),
  };
}
