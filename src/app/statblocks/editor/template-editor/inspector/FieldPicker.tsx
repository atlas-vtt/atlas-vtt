import React, { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fieldByKey } from '../../../model/fieldKeys';
import type { FieldKey, FieldType } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { fieldChoiceGroups, type FieldChoice } from './fieldChoices';
import { choiceId, FieldChoiceList } from './FieldChoiceList';
import { t } from '../../../../i18n';

export interface FieldPickerProps {
  /** The visible label that names the picker. */
  labelledBy: string;
  /** The field shown now; null where none is. */
  value: FieldKey | null;
  /** The types the place takes; null takes any. */
  accepts: readonly FieldType[] | null;
  /** Offers the collection's keys and a new field as typed. */
  allowNew: boolean;
  disabled: boolean;
  placeholder?: string | undefined;
  onPick: (choice: FieldChoice) => void;
}

/**
 * The field picker (§7.4): a combobox that shows the bound field's label and,
 * once typed in or opened, this template's fields, the keys the collection's
 * statblocks use, and New field “Speed”. Enter picks, Escape closes and puts
 * the label back.
 */
export function FieldPicker({ labelledBy, value, accepts, allowNew, disabled, placeholder = t('templateEditor.chooseProperty'), onPick }: FieldPickerProps): React.JSX.Element {
  const { snapshot, collectionKeys } = useTemplateEditor();
  const { template } = snapshot;
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const open = query !== null;
  const current = value ? fieldByKey(template.fields, value) : undefined;
  const shown = current?.label || value || '';
  const groups = useMemo(
    () => (open ? fieldChoiceGroups(template, query, accepts, collectionKeys, allowNew) : []),
    [open, template, query, accepts, collectionKeys, allowNew],
  );
  const choices = groups.flatMap((group) => group.choices);
  const highlighted = choices[Math.min(active, choices.length - 1)];

  const close = (): void => setQuery(null);
  const pick = (choice: FieldChoice): void => {
    close();
    onPick(choice);
  };
  const openWith = (text: string): void => {
    setQuery(text);
    setActive(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const count = choices.length;
    if (event.key === 'ArrowDown') {
      if (!open) openWith('');
      else if (count) setActive((index) => (index + 1) % count);
    } else if (event.key === 'ArrowUp' && open && count) setActive((index) => (index - 1 + count) % count);
    else if (event.key === 'Enter' && open && highlighted) pick(highlighted);
    else if (event.key === 'Escape' && open) close();
    else {
      if (event.key === 'Tab') close();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={rootRef}
      className="atlas-te-picker"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) close();
      }}
    >
      <input
        type="text"
        role="combobox"
        className="atlas-te-input atlas-te-picker__input"
        aria-labelledby={labelledBy}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && highlighted ? choiceId(listId, highlighted) : undefined}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : shown}
        onChange={(event) => openWith(event.target.value)}
        onClick={() => { if (!open && !disabled) openWith(''); }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown className="atlas-te-picker__chevron" aria-hidden="true" />
      {open && (
        <FieldChoiceList
          id={listId}
          label={t('templateEditor.properties')}
          groups={groups}
          active={highlighted}
          onHover={(choice) => setActive(choices.indexOf(choice))}
          onPick={pick}
        />
      )}
    </div>
  );
}
