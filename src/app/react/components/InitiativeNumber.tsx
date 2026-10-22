import React, { useEffect, useRef } from 'react';
import { scrollWithin } from '../../utils/scrollWithin';
import { t } from '../../i18n';

/** Where Tab and Shift+Tab move the editing to after a commit: the next card, the one before, or nowhere. */
export type NumberStep = -1 | 0 | 1;

interface InitiativeNumberProps {
  value: number;
  /** No number was rolled or typed yet: an empty slot stands in its place. */
  empty: boolean;
  editing: boolean;
  onStartEdit: () => void;
  /** The typed text, and where the editing goes next. */
  onCommit: (text: string, step: NumberStep) => void;
  onCancel: () => void;
}

/**
 * A combatant's initiative on its card, typed in place: a click turns it into a field. Enter or
 * leaving the field keeps what was typed, Escape drops it, Tab and Shift+Tab keep it and go on to
 * the next or previous card's number, so a whole table is typed in one go. No key typed here
 * reaches the map's shortcuts.
 */
export function InitiativeNumber({ value, empty, editing, onStartEdit, onCommit, onCancel }: InitiativeNumberProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  // Set once the field has given its answer, so the blur of a field going away answers nothing more
  const answeredRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!editing || !input) return;
    answeredRef.current = false;
    input.focus({ preventScroll: true });
    input.select();
    const list = input.closest<HTMLElement>('.atlas-initiative-tracker__content');
    const card = input.closest('.atlas-initiative-card');
    if (list && card) scrollWithin(list, card, 'nearest');
  }, [editing]);

  const answer = (respond: () => void): void => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    respond();
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`atlas-initiative-card__initiative${empty ? ' atlas-initiative-card__initiative--empty' : ''}`}
        aria-label={empty ? t('initiative.typeNumber') : t('initiative.editNumber', { value })}
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
      >
        {empty ? '–' : value}
      </button>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      answer(() => onCommit(e.currentTarget.value, 0));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      answer(onCancel);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const text = e.currentTarget.value;
      answer(() => onCommit(text, e.shiftKey ? -1 : 1));
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="atlas-initiative-card__initiative-input"
      aria-label={t('initiative.total')}
      defaultValue={empty ? '' : String(value)}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const text = e.currentTarget.value;
        answer(() => onCommit(text, 0));
      }}
    />
  );
}
