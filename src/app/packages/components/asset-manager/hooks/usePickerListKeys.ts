import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';

export interface PickerListKeysDeps<T> {
  /** The choices the list shows, in order. */
  choices: readonly T[];
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
  chosen: T;
  choose: (choice: T) => void;
  onConfirm: () => void;
}

export interface PickerListKeys {
  /** The row the arrow keys are on, -1 while the list is closed or empty. */
  highlight: number;
  setHighlight: (index: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Where the highlight lands when a key opens the closed list (WAI-ARIA combobox): Down on the
 * row after the chosen one, Up on the row before it (the last from the first row), Alt+Down on
 * the chosen one itself.
 */
function openingHighlight(key: 'ArrowDown' | 'ArrowUp', altKey: boolean, chosenIndex: number, count: number): number {
  if (count === 0) return -1;
  if (altKey) return Math.max(0, chosenIndex);
  if (key === 'ArrowDown') return Math.min(count - 1, chosenIndex + 1);
  return chosenIndex <= 0 ? count - 1 : chosenIndex - 1;
}

/**
 * The keys of a picker dialog's field (Move to folder, Move or Copy to collection), a combobox over its list
 * (WAI-ARIA): Down and Up open the closed list and move the highlight, Alt+Down opens it on the chosen row, Alt+Up
 * takes the highlighted row and closes it, Enter takes the highlighted row, or confirms once the list is closed.
 * Escape is the dialog's (`useDialogEscape`): it closes the list first.
 */
export function usePickerListKeys<T>({ choices, listOpen, setListOpen, chosen, choose, onConfirm }: PickerListKeysDeps<T>): PickerListKeys {
  const [highlight, setHighlight] = useState(-1);
  // The row a key asked for as it opened the list; any other opening starts on the chosen row.
  const openedAt = useRef<number | null>(null);

  // A new search starts from the chosen row, or the first row.
  useEffect(() => {
    const asked = openedAt.current;
    openedAt.current = null;
    setHighlight(listOpen ? asked ?? Math.max(0, choices.indexOf(chosen)) : -1);
  }, [listOpen, choices.length]);

  const take = (index: number): void => {
    if (index >= 0 && index < choices.length) choose(choices[index]!);
    setListOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const count = choices.length;
    const { key, altKey } = event;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (!listOpen) {
        if (key === 'ArrowUp' && altKey) return;
        openedAt.current = openingHighlight(key, altKey, choices.indexOf(chosen), count);
        setListOpen(true);
      } else if (altKey) {
        if (key === 'ArrowUp') take(highlight);
      } else if (count > 0) {
        setHighlight(Math.min(count - 1, Math.max(0, highlight + (key === 'ArrowDown' ? 1 : -1))));
      }
    } else if (key === 'Enter') {
      if (listOpen && highlight >= 0 && highlight < count) take(highlight);
      else onConfirm();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return { highlight: listOpen ? Math.min(highlight, choices.length - 1) : -1, setHighlight, onKeyDown };
}
