import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { initiativeEdit, modifierText } from '../../initiative/initiativeEdit';
import { hasInitiative } from '../../initiative/awaitingInitiative';
import { EditInitiativePopup } from './EditInitiativePopup';

interface OpenPopup {
  entry: InitiativeEntry;
  anchorRect: DOMRect;
  value: string;
  modifier: string;
}

/** The card menu's Edit Initiative popup: `open` shows it beside a card on `side`, `popup` is what the tracker renders. */
export function useEditInitiativePopup(update: (id: string, changes: Partial<InitiativeEntry>) => void, side: 'left' | 'right' = 'left'): {
  open: (entry: InitiativeEntry, cardElement: HTMLElement) => void;
  popup: React.ReactNode;
} {
  const [shown, setShown] = useState<OpenPopup | null>(null);

  const open = useCallback((entry: InitiativeEntry, cardElement: HTMLElement): void => {
    setShown({
      entry,
      anchorRect: cardElement.getBoundingClientRect(),
      // A combatant waiting for its number shows an empty field, not a 0 nobody rolled
      value: hasInitiative(entry) ? String(entry.initiative) : '',
      modifier: modifierText(entry),
    });
  }, []);

  const popup = shown && createPortal(
    <EditInitiativePopup
      entry={shown.entry}
      anchorRect={shown.anchorRect}
      value={shown.value}
      onChange={(value) => setShown({ ...shown, value })}
      modifier={shown.modifier}
      onModifierChange={(modifier) => setShown({ ...shown, modifier })}
      onConfirm={() => {
        update(shown.entry.id, initiativeEdit(shown.value, shown.modifier));
        setShown(null);
      }}
      onCancel={() => setShown(null)}
      side={side}
    />,
    document.body,
  );

  return { open, popup };
}
