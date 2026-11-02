import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { TemplateField } from '../../model/templateTypes';
import type { FieldRead } from '../../values/fieldValues';
import { valueText } from '../../values/valueText';
import { usePaneEdit, type PaneEditController } from './paneEditContext';
import type { ValueInputProps } from './TextValueInput';
import { addItemPatches, listItems, removeItemPatches } from './valuePatches';
import { t } from '../../../i18n';

export interface ChipsEditorProps {
  field: TemplateField;
  /** What the note holds now; every change is one patch against it. */
  read: FieldRead;
  write: PaneEditController['write'];
  autoFocus: boolean;
  /** What the input shows while the list is empty; the field's prompt or label by default. */
  placeholder?: string | undefined;
  /** Keys the chips do not use themselves: Tab, and Escape once nothing is typed. */
  onLeave?: ((key: 'Tab' | 'Shift+Tab' | 'Escape') => void) | undefined;
}

/**
 * A list as chips (§7.6): Enter adds what was typed, Backspace in an empty
 * field removes the last chip, each chip's × removes it. Every change is
 * written at once, an item at a time, never the whole list.
 */
export function ChipsEditor({ field, read, write, autoFocus, placeholder, onLeave }: ChipsEditorProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  // Read synchronously, so a chip added by Enter or Tab is not added again as the editor goes.
  const typedRef = useRef('');
  const items = listItems(read.value).map(valueText);

  useLayoutEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  // A chip typed but not added yet is added as the editor goes.
  const addRef = useRef<() => void>(() => undefined);
  useEffect(() => () => addRef.current(), []);
  const type = (text: string): void => {
    typedRef.current = text;
    setTyped(text);
  };

  const add = (): void => {
    const item = typedRef.current.trim();
    if (!item) return;
    type('');
    void write(field, addItemPatches(read, field.key, item));
  };
  addRef.current = add;
  const remove = (index: number): void => {
    void write(field, removeItemPatches(read, field.key, index));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && typed === '' && items.length > 0) {
      event.preventDefault();
      remove(items.length - 1);
    } else if (event.key === 'Tab' && onLeave) {
      event.preventDefault();
      add();
      onLeave(event.shiftKey ? 'Shift+Tab' : 'Tab');
    } else if (event.key === 'Escape' && onLeave && !handledByAnotherControl(event.nativeEvent)) {
      event.preventDefault();
      type('');
      onLeave('Escape');
    }
  };

  return (
    <span className="atlas-sb-pane-chips">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="atlas-sb-pane-chip">
          <span className="atlas-sb-pane-chip__text">{item}</span>
          <LabelTooltip label={t('statblockEditor.removeNamed', { name: item })}>
            <button type="button" className="atlas-sb-pane-chip__remove" onClick={() => remove(index)}>
              <X aria-hidden="true" />
            </button>
          </LabelTooltip>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        className="atlas-sb-pane-input atlas-sb-pane-chips__input"
        value={typed}
        placeholder={items.length ? '' : placeholder ?? (field.prompt?.trim() || field.label)}
        aria-label={t('statblockEditor.addTo', { name: field.label })}
        onChange={(event) => type(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
      />
    </span>
  );
}

/** A list field of the card as chips; Tab and Escape move on as every value input does. */
export function ListValueInput({ field, autoFocus, placeholder }: ValueInputProps): React.JSX.Element {
  const pane = usePaneEdit();
  return (
    <ChipsEditor
      field={field}
      read={pane.read(field)}
      write={pane.write}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onLeave={(key) => {
        if (key === 'Escape') pane.stop(true);
        else pane.move(field.key, key === 'Tab' ? 1 : -1);
      }}
    />
  );
}
