import { useCallback, useRef, useState } from 'react';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { totalEdit } from '../../initiative/initiativeEdit';
import type { NumberStep } from './InitiativeNumber';

/** Which card's number is being typed, and what the cards call while it is. */
export interface NumberEditing {
  editingId: string | null;
  start: (entry: InitiativeEntry) => void;
  commit: (entry: InitiativeEntry, text: string, step: NumberStep) => void;
  cancel: () => void;
}

/**
 * Typing the combatants' numbers on their cards, one card at a time. A commit writes the number
 * as the edit popup does (`totalEdit`). A run of typing keeps the order of `entries` as it stood
 * when its first field opened, and Tab and Shift+Tab go on to the card after or before in that
 * order until the run ends (Enter, Escape, leaving the field, or past either end): a list that
 * sorts itself anew after every number would otherwise bring a card back that was typed already.
 */
export function useNumberEditing(
  entries: readonly InitiativeEntry[],
  update: (id: string, changes: Partial<InitiativeEntry>) => void,
): NumberEditing {
  const [editingId, setEditingId] = useState<string | null>(null);
  const runOrder = useRef<readonly string[] | null>(null);

  const commit = useCallback((entry: InitiativeEntry, text: string, step: NumberStep): void => {
    const order = runOrder.current ?? entries.map((candidate) => candidate.id);
    const listed = new Set(entries.map((candidate) => candidate.id));
    let next: string | undefined;
    // A combatant removed since the run began is passed over
    for (let index = order.indexOf(entry.id) + step; step !== 0 && index >= 0 && index < order.length; index += step) {
      if (listed.has(order[index]!)) {
        next = order[index];
        break;
      }
    }
    const changes = totalEdit(text);
    if (changes.initiative !== undefined) update(entry.id, changes);
    if (next === undefined) runOrder.current = null;
    setEditingId(next ?? null);
  }, [entries, update]);

  const start = useCallback((entry: InitiativeEntry): void => {
    runOrder.current = entries.map((candidate) => candidate.id);
    setEditingId(entry.id);
  }, [entries]);

  const cancel = useCallback((): void => {
    runOrder.current = null;
    setEditingId(null);
  }, []);

  return { editingId, start, commit, cancel };
}
