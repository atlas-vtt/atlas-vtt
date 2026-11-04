import React, { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { choiceOptions, useOptionList } from './ChoiceOptionList';
import type { ValueInputProps } from './TextValueInput';
import { useFieldDraft } from './useFieldDraft';

/**
 * One of a field's options (§7.6), as a dropdown: the list opens with the
 * input, showing every option; typing filters it, ↑/↓ move through it, Enter
 * takes the highlighted option, and an open field also takes what was typed.
 * Escape closes the list first, then leaves the field.
 */
export function ChoiceValueInput({ field, autoFocus, placeholder }: ValueInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const { draft, setDraft, commit, onKey, focusProps, pane } = useFieldDraft(field, inputRef, autoFocus);
  // What was typed since the list opened: until then it shows every option, not only the one picked.
  const [typed, setTyped] = useState<string | null>(null);
  const options = choiceOptions(field, typed ?? '');
  const list = useOptionList(field.label, options, (value) => {
    setDraft(value);
    setTyped(null);
    void commit(value);
    pane.stop(true);
  });

  const show = (): void => {
    setTyped(null);
    list.show();
  };

  return (
    <span className="atlas-sb-pane-field atlas-sb-pane-choice">
      <input
        ref={inputRef}
        type="text"
        className="atlas-sb-pane-input"
        value={draft}
        placeholder={placeholder ?? (field.prompt?.trim() || field.label)}
        aria-label={field.label}
        {...list.inputProps}
        onChange={(event) => {
          setDraft(event.target.value);
          setTyped(event.target.value);
          list.restart();
        }}
        onKeyDown={(event) => {
          if (!list.onKey(event)) onKey(event);
        }}
        onMouseDown={() => { if (!list.open) show(); }}
        {...focusProps}
        onFocus={() => {
          focusProps.onFocus();
          show();
        }}
        onBlur={() => {
          list.setOpen(false);
          focusProps.onBlur();
        }}
      />
      <ChevronDown className="atlas-sb-pane-choice__chevron" aria-hidden="true" />
      {list.list}
    </span>
  );
}
