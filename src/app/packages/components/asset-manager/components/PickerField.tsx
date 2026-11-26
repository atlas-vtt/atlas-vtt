import React, { useId, useLayoutEffect, type RefObject } from 'react';
import { usePickerListKeys } from '../hooks/usePickerListKeys';
import type { PickerRow } from './PickerOption';

export interface PickerFieldProps<T> {
  label: string;
  placeholder: string;
  fieldRef: RefObject<HTMLInputElement | null>;
  /** The field's text: a search, or the name of the row taken. */
  text: string;
  onText: (text: string) => void;
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
  /** The rows the search leaves, in order. */
  choices: readonly T[];
  chosen: T;
  choose: (choice: T) => void;
  /** Enter with the list closed. */
  onConfirm: () => void;
  keyOf: (choice: T) => string;
  renderOption: (choice: T, row: PickerRow) => React.ReactNode;
  /** Said in the open list where the search leaves no row; without it the list stays closed then. */
  noMatch?: string;
}

/**
 * The field of a picker dialog (Move to folder, Move or Copy to collection): a combobox over a listbox (WAI-ARIA). Focus
 * stays in the field, which typing searches. The list stands open as the dialog opens, on the chosen row, so the choices
 * show before anything is typed; once closed (a row taken, Escape) it opens again on a click, a key or typing, and the
 * arrow keys move its highlight (`usePickerListKeys`). The dialog keeps the state, so its Escape can close the list first.
 */
export function PickerField<T>({
  label, placeholder, fieldRef, text, onText, listOpen, setListOpen, choices, chosen, choose, onConfirm, keyOf, renderOption, noMatch,
}: PickerFieldProps<T>): React.JSX.Element {
  const labelId = useId();
  const listId = useId();
  const keys = usePickerListKeys({ choices, listOpen, setListOpen, chosen, choose, onConfirm });
  // Before the dialog's first paint, so it never draws without its list and then grows.
  useLayoutEffect(() => { setListOpen(true); }, []);
  const showsList = listOpen && choices.length > 0;
  // A listbox holds options only, so the message stands in a box of the list's look instead.
  const showsNoMatch = listOpen && choices.length === 0 && noMatch !== undefined;
  const rowOf = (choice: T, index: number): PickerRow => {
    const selected = choice === chosen;
    const active = keys.highlight === index;
    return {
      id: `${listId}-${index}`,
      role: 'option',
      'aria-selected': selected,
      selected,
      className: `atlas-move-folder-item${selected ? ' is-selected' : ''}${active ? ' atlas-active' : ''}`,
      onPointerMove: () => keys.setHighlight(index),
      ...(active && { 'data-highlighted': '' }),
    };
  };
  return (
    <>
      <div id={labelId} className="atlas-asset-manager-move-label">{label}</div>
      <input
        ref={fieldRef}
        type="text"
        role="combobox"
        // Focus moves into the dialog as it opens (WAI-ARIA dialog), onto the field typing searches.
        autoFocus
        aria-labelledby={labelId}
        aria-autocomplete="list"
        aria-expanded={showsList}
        {...(showsList && { 'aria-controls': listId })}
        {...(keys.highlight >= 0 && { 'aria-activedescendant': `${listId}-${keys.highlight}` })}
        onKeyDown={keys.onKeyDown}
        className="atlas-asset-manager-move-input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => { onText(e.target.value); setListOpen(true); }}
        onClick={() => setListOpen(true)}
        onBlur={() => window.setTimeout(() => setListOpen(false), 150)}
      />
      {showsList && (
        <div id={listId} className="atlas-move-folder-list" role="listbox" aria-labelledby={labelId}>
          {choices.map((choice, index) => <React.Fragment key={keyOf(choice)}>{renderOption(choice, rowOf(choice, index))}</React.Fragment>)}
        </div>
      )}
      {showsNoMatch && (
        <div className="atlas-move-folder-list">
          <div className="atlas-move-folder-empty" role="status">{noMatch}</div>
        </div>
      )}
    </>
  );
}
