import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import type { FieldValue } from '../../model/templateTypes';
import { choiceText, newPick, optionsLeft, readChoice, type ChoicePick, type ChoiceRead } from '../../values/choicePicks';
import { formatNumber, parseNumberText } from '../../values/numberText';
import { choiceOptions, useOptionList } from './ChoiceOptionList';
import { ChipRemove, UnreadChip } from './PaneChips';
import { usePaneEdit } from './paneEditContext';
import type { ValueInputProps } from './TextValueInput';
import { fieldPatches } from './valuePatches';
import { t } from '../../../i18n';

interface PickNumberProps {
  pick: ChoicePick;
  label: string;
  /** Set when the pick was just added: its number takes focus. */
  focusOnMount: boolean;
  onNumber: (number: number | null) => void;
  onDone: () => void;
}

/** A pick's number, written on Enter or when focus leaves; text that is no number puts the old one back. */
function PickNumber({ pick, label, focusOnMount, onNumber, onDone }: PickNumberProps): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const written = pick.number === null ? '' : formatNumber(pick.number);
  const [draft, setDraft] = useState(written);
  useLayoutEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  const commit = (): void => {
    const text = draft.trim();
    const number = text === '' ? null : parseNumberText(text);
    if (text !== '' && number === null) setDraft(written);
    else if (number !== pick.number) onNumber(number);
  };
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      className="atlas-sb-pane-input atlas-sb-pane-pick__number"
      value={draft}
      placeholder="#"
      aria-label={`${label}: ${pick.option}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          onDone();
        } else if (event.key === 'Escape' && !handledByAnotherControl(event.nativeEvent)) {
          event.preventDefault();
          setDraft(written);
          onDone();
        }
      }}
    />
  );
}

/**
 * A choice that takes several options, or a number with each (§7.6): the
 * picks as chips, each with its number where the field takes one, and a
 * dropdown under the input with the options not picked yet. Every change is
 * written at once, as the one line the note keeps ("darkvision 60 ft.,
 * blindsight 10 ft."); a part of that line that names no option stays as it
 * is written, flagged, until it is removed. A field that takes one option
 * swaps the pick and keeps its number.
 */
export function ChoicePicksInput({ field, autoFocus, placeholder }: ValueInputProps): React.JSX.Element {
  const pane = usePaneEdit();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [focusPick, setFocusPick] = useState<string | null>(null);
  const read = readChoice(field, pane.read(field).value);

  useLayoutEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const save = (next: ChoiceRead): void => {
    const now = pane.read(field);
    const text = choiceText(field, next);
    const value: FieldValue | undefined = text === '' ? undefined : text;
    void pane.write(field, fieldPatches(field.key, now, value), { base: now.value, mine: value });
  };

  const add = (option: string): void => {
    setTyped('');
    const kept = field.several ? read.picks : [];
    const number = field.several ? null : read.picks[0]?.number ?? null;
    save({ ...read, picks: [...kept, { ...newPick(field, option), number }] });
    if (field.numbered) setFocusPick(option);
  };
  const removePick = (index: number): void => {
    save({ ...read, picks: read.picks.filter((_, at) => at !== index) });
    inputRef.current?.focus();
  };
  const removeUnread = (index: number): void => {
    save({ ...read, unread: read.unread.filter((_, at) => at !== index) });
    inputRef.current?.focus();
  };

  const options = choiceOptions(field, typed, optionsLeft(field, read.picks));
  const list = useOptionList(field.label, options, add);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (list.onKey(event)) return;
    if (event.key === 'Backspace' && typed === '' && read.picks.length + read.unread.length > 0) {
      event.preventDefault();
      if (read.unread.length > 0) removeUnread(read.unread.length - 1);
      else removePick(read.picks.length - 1);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      pane.move(field.key, event.shiftKey ? -1 : 1);
    } else if ((event.key === 'Escape' && !handledByAnotherControl(event.nativeEvent)) || event.key === 'Enter') {
      event.preventDefault();
      setTyped('');
      pane.stop(true);
    }
  };

  const empty = read.picks.length + read.unread.length === 0;
  return (
    <span className="atlas-sb-pane-field atlas-sb-pane-choice atlas-sb-pane-chips">
      {read.picks.map((pick, index) => (
        <span key={`${pick.option}-${index}`} className="atlas-sb-pane-chip atlas-sb-pane-pick">
          <span className="atlas-sb-pane-chip__text">{pick.option}</span>
          {field.numbered && (
            <>
              <PickNumber
                // A number changed in the note starts the input anew from it.
                key={String(pick.number)}
                pick={pick}
                label={field.label}
                focusOnMount={focusPick === pick.option}
                onNumber={(number) => {
                  setFocusPick(null);
                  save({ ...read, picks: read.picks.map((other, at) => (at === index ? { ...other, number } : other)) });
                }}
                onDone={() => {
                  setFocusPick(null);
                  inputRef.current?.focus();
                }}
              />
              {pick.unit && <span className="atlas-sb-pane-pick__unit">{pick.unit}</span>}
            </>
          )}
          <ChipRemove label={t('statblockEditor.removeNamed', { name: pick.option })} onRemove={() => removePick(index)} />
        </span>
      ))}
      {read.unread.map((part, index) => (
        <UnreadChip key={`unread-${part}-${index}`} part={part} onRemove={() => removeUnread(index)} />
      ))}
      <span className="atlas-sb-pane-pick__add">
        <input
          ref={inputRef}
          type="text"
          className="atlas-sb-pane-input atlas-sb-pane-chips__input"
          value={typed}
          placeholder={empty ? placeholder ?? (field.prompt?.trim() || field.label) : ''}
          aria-label={field.several ? t('statblockEditor.addTo', { name: field.label }) : field.label}
          {...list.inputProps}
          onChange={(event) => {
            setTyped(event.target.value);
            list.restart();
          }}
          onKeyDown={onKeyDown}
          onMouseDown={() => { if (!list.open) list.show(); }}
          onFocus={list.show}
          onBlur={() => {
            list.setOpen(false);
            setTyped('');
          }}
        />
        <ChevronDown className="atlas-sb-pane-choice__chevron" aria-hidden="true" />
        {list.list}
      </span>
    </span>
  );
}
