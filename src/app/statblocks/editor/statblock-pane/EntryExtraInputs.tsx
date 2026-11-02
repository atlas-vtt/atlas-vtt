import React, { useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { EntryExtraShape } from '../../model/templateTypes';
import { choiceText, newPick, optionsLeft, readChoice, type ChoiceShape } from '../../values/choicePicks';
import { useOptionList, type ChoiceOption } from './ChoiceOptionList';
import { ChipRemove, UnreadChip } from './PaneChips';
import { t } from '../../../i18n';

/** Marks the input of each part, which Enter steps through after the name. */
export const ENTRY_PART_CONTROL = 'data-entry-control';

const CONTROL = { [ENTRY_PART_CONTROL]: '' } as const;

/** The empty choice: picking it removes the part from the ability. */
const NONE: ChoiceOption = { value: '', label: '—' };

interface PartInputProps {
  extra: EntryExtraShape;
  /** The id of the part's visible label, which names its control. */
  labelId: string;
  text: string;
  onChange: (text: string) => void;
}

/** A part typed as text: text and dice as they are, a number, or a list's items between commas. */
function PartTextInput({ extra, labelId, text, onChange }: PartInputProps): React.JSX.Element {
  return (
    <input
      {...CONTROL}
      type="text"
      inputMode={extra.type === 'number' ? 'decimal' : undefined}
      className="atlas-sb-pane-input atlas-sb-pane-entry__control"
      value={text}
      aria-labelledby={labelId}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A dropdown that opens with its input, as the pane's choice Values do; nothing is typed into it. */
function usePartList(labelText: string, options: readonly ChoiceOption[], onPick: (value: string) => void): {
  list: ReturnType<typeof useOptionList>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  /** For the box around the input: a press anywhere on it (its chevron, its padding, a chip's gap) opens the list from the input. */
  boxProps: React.HTMLAttributes<HTMLSpanElement>;
} {
  const list = useOptionList(labelText, options, onPick);
  const inputRef = useRef<HTMLInputElement>(null);
  return {
    list,
    inputRef,
    inputProps: {
      ...list.inputProps,
      readOnly: true,
      onMouseDown: () => { if (!list.open) list.show(); },
      onFocus: list.show,
      onBlur: () => list.setOpen(false),
    },
    boxProps: {
      onMouseDown: (event) => {
        const input = inputRef.current;
        // The input and the box's own controls (a chip's cross) take their press themselves
        if (input === null || event.button !== 0 || (event.target as Partial<Element>).closest?.('input, button') != null) return;
        // A press that lands on no control would take focus out of the ability and close it
        event.preventDefault();
        input.focus();
        list.show();
      },
    },
  };
}

/** Keys the dropdown takes for itself; Alt with ↑/↓ is left to the ability, which it moves. */
function onListKey(list: ReturnType<typeof useOptionList>, event: React.KeyboardEvent<HTMLInputElement>): boolean {
  if (event.altKey) return false;
  if (event.key === ' ') {
    event.preventDefault();
    if (list.open) list.setOpen(false);
    else list.show();
    return true;
  }
  return list.onKey(event);
}

/** One of the template's options, or none. A value of the note's that is no option shows as written and stays until another is picked. */
function PartChoiceInput({ extra, labelId, text, onChange }: PartInputProps): React.JSX.Element {
  const options = [NONE, ...(extra.options ?? []).map((option) => ({ value: option, label: option }))];
  const { list, inputRef, inputProps, boxProps } = usePartList(extra.label, options, onChange);
  return (
    <span className="atlas-sb-pane-field atlas-sb-pane-choice atlas-sb-pane-entry__control" {...boxProps}>
      <input
        {...CONTROL}
        ref={inputRef}
        type="text"
        className="atlas-sb-pane-input"
        value={text}
        placeholder={NONE.label}
        aria-labelledby={labelId}
        {...inputProps}
        onKeyDown={(event) => { onListKey(list, event); }}
      />
      <ChevronDown className="atlas-sb-pane-choice__chevron" aria-hidden="true" />
      {list.list}
    </span>
  );
}

/** Any of the template's options at once, as chips, written as one line in the order of the options. Parts that name none stay until removed. */
function PartPicksInput({ extra, labelId, text, onChange }: PartInputProps): React.JSX.Element {
  const shape: ChoiceShape = { options: extra.options ?? [], several: true };
  const read = readChoice(shape, text);
  const left = optionsLeft(shape, read.picks).map((option) => ({ value: option, label: option }));
  const { list, inputRef, inputProps, boxProps } = usePartList(extra.label, left, (option) => {
    onChange(choiceText(shape, { ...read, picks: [...read.picks, newPick(shape, option)] }));
  });
  const removePick = (index: number): void => {
    inputRef.current?.focus();
    onChange(choiceText(shape, { ...read, picks: read.picks.filter((_, at) => at !== index) }));
  };
  const removeUnread = (index: number): void => {
    inputRef.current?.focus();
    onChange(choiceText(shape, { ...read, unread: read.unread.filter((_, at) => at !== index) }));
  };
  const empty = read.picks.length + read.unread.length === 0;
  return (
    <span className="atlas-sb-pane-field atlas-sb-pane-choice atlas-sb-pane-chips atlas-sb-pane-entry__control" {...boxProps}>
      {read.picks.map((pick, index) => (
        <span key={`${pick.option}-${index}`} className="atlas-sb-pane-chip atlas-sb-pane-pick">
          <span className="atlas-sb-pane-chip__text">{pick.option}</span>
          <ChipRemove label={t('statblockEditor.removeNamed', { name: pick.option })} onRemove={() => removePick(index)} />
        </span>
      ))}
      {read.unread.map((part, index) => (
        <UnreadChip key={`unread-${part}-${index}`} part={part} onRemove={() => removeUnread(index)} />
      ))}
      <span className="atlas-sb-pane-pick__add">
        <input
          {...CONTROL}
          ref={inputRef}
          type="text"
          className="atlas-sb-pane-input atlas-sb-pane-chips__input"
          value=""
          placeholder={empty ? NONE.label : ''}
          aria-labelledby={labelId}
          {...inputProps}
          onKeyDown={(event) => {
            if (onListKey(list, event)) return;
            if (event.key === 'Backspace' && !empty) {
              event.preventDefault();
              if (read.unread.length > 0) removeUnread(read.unread.length - 1);
              else removePick(read.picks.length - 1);
            }
          }}
        />
        <ChevronDown className="atlas-sb-pane-choice__chevron" aria-hidden="true" />
        {list.list}
      </span>
    </span>
  );
}

function PartInput(props: PartInputProps): React.JSX.Element {
  if (props.extra.type !== 'choice') return <PartTextInput {...props} />;
  return props.extra.several ? <PartPicksInput {...props} /> : <PartChoiceInput {...props} />;
}

export interface EntryExtraInputsProps {
  extras: readonly EntryExtraShape[];
  /** A part's text as its input shows it. */
  textOf: (key: string) => string;
  onChange: (key: string, text: string) => void;
}

/** The parts an ability has besides its name and text ("Type", "Range"), each under its label, in the shape's order. */
export function EntryExtraInputs({ extras, textOf, onChange }: EntryExtraInputsProps): React.JSX.Element | null {
  const id = useId();
  if (extras.length === 0) return null;
  return (
    <span className="atlas-sb-pane-entry__parts">
      {extras.map((extra, index) => {
        const labelId = `${id}-${index}`;
        return (
          <span key={extra.key} className="atlas-sb-pane-entry__part" data-entry-part="extra" data-entry-extra={extra.key}>
            <span id={labelId} className="atlas-sb-entry-extra-label">{extra.label}</span>
            <PartInput extra={extra} labelId={labelId} text={textOf(extra.key)} onChange={(text) => onChange(extra.key, text)} />
          </span>
        );
      })}
    </span>
  );
}
