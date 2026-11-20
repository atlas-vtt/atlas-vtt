import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useListPlacement } from './selectListPlacement';

export interface ComboBoxOption {
  value: string;
  label: string;
}

interface ComboBoxProps {
  /** An option's value, or text typed that is none of them. */
  value: string;
  options: readonly ComboBoxOption[];
  onChange: (value: string) => void;
  /** Id of the visible label element. */
  labelledBy: string;
  /** The row that keeps what was typed as it is ("Use “Mothership”"), shown while the text names no option. */
  typedLabel: (text: string) => string;
  /** Whether an option answers what was typed; every option while nothing is. */
  matches: (option: ComboBoxOption, text: string) => boolean;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  /** Where the list opens, as for `Select`. */
  layer?: HTMLElement | null | undefined;
}

type Row = { kind: 'option'; option: ComboBoxOption } | { kind: 'typed'; text: string };

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * A text field with a list of choices: pick one, or type what the list lacks (WAI-ARIA combobox, list autocomplete).
 * It takes `Select`'s look, so a field that offers choices and one that also takes typing look alike.
 */
export function ComboBox({ value, options, onChange, labelledBy, typedLabel, matches, placeholder, describedBy, invalid, layer = null }: ComboBoxProps): React.JSX.Element {
  const chosen = options.find((option) => option.value === value);
  const shown = chosen?.label ?? value;
  const [text, setText] = useState(shown);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // The list narrows to what was typed only while typing; opened by a click or a key it offers every choice.
  const [filtering, setFiltering] = useState(false);
  const typed = filtering ? text.trim() : '';
  const listed = typed === '' ? options : options.filter((option) => matches(option, typed));
  const named = listed.some((option) => option.label.toLowerCase() === typed.toLowerCase());
  const rows: Row[] = [...listed.map((option): Row => ({ kind: 'option', option })), ...(typed !== '' && !named ? [{ kind: 'typed' as const, text: typed }] : [])];
  const { fit, style, alignEnd } = useListPlacement(isOpen, rootRef, listRef, layer, rows.length);

  // What another hand changed (a draft loaded, a step back) shows while the field is not being typed in.
  useEffect(() => {
    if (inputRef.current?.ownerDocument.activeElement !== inputRef.current) setText(shown);
  }, [shown]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setIsOpen(false);
    };
    doc.addEventListener('pointerdown', onPointerDown);
    return () => doc.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (active >= 0) listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (row: Row): void => {
    if (row.kind === 'option') {
      setText(row.option.label);
      if (row.option.value !== value) onChange(row.option.value);
    } else {
      setText(row.text);
      onChange(row.text);
    }
    setIsOpen(false);
    setFiltering(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActive((index) => Math.min(rows.length - 1, Math.max(0, index + step)));
    } else if (event.key === 'Enter' && isOpen) {
      event.preventDefault();
      const row = rows[active];
      if (row) choose(row);
      else setIsOpen(false);
    } else if (event.key === 'Escape' && isOpen) {
      // The list takes this Escape; the dialog around it stays (`useDialogEscape` leaves an open combobox's key alone).
      event.preventDefault();
      setIsOpen(false);
      setFiltering(false);
      setActive(-1);
    }
  };

  const list = isOpen && rows.length > 0 && (
    <div ref={listRef} id={listId} role="listbox" aria-labelledby={labelledBy}
      className={cn('atlas-select-content', 'atlas-combobox-list', fit.up && 'atlas-select-content--up', alignEnd && 'atlas-select-content--end', layer && 'atlas-select-content--layered')}
      style={layer ? style : fit.maxHeight === null ? undefined : { maxHeight: fit.maxHeight }}>
      {rows.map((row, index) => {
        const selected = row.kind === 'option' && row.option.value === value;
        return (
          <div key={row.kind === 'option' ? row.option.value : 'typed'} id={`${listId}-${index}`} data-row={index} role="option" aria-selected={selected}
            className={cn('atlas-select-option', selected && 'atlas-selected', index === active && 'atlas-active', row.kind === 'typed' && 'atlas-combobox-typed')}
            onPointerDown={(event) => event.preventDefault()} onClick={() => choose(row)} onPointerMove={() => setActive(index)}>
            {row.kind === 'typed' && <Plus aria-hidden="true" className="atlas-combobox-typed-icon" />}
            <span className="atlas-select-option-text">{row.kind === 'option' ? row.option.label : typedLabel(row.text)}</span>
            <Check aria-hidden="true" className="atlas-select-check" />
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className={cn('atlas-select', 'atlas-combobox', isOpen && 'atlas-open')}>
      <div className={cn('atlas-select-trigger', 'atlas-combobox-field', isOpen && 'atlas-open')} data-invalid={invalid || undefined}>
        <input ref={inputRef} type="text" role="combobox" className="atlas-combobox-input" value={text} placeholder={placeholder}
          aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-autocomplete="list"
          aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined} aria-activedescendant={isOpen && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setFiltering(true);
            setIsOpen(true);
            setActive(-1);
            onChange(event.target.value);
          }}
          onFocus={(event) => event.target.select()}
          onClick={() => setIsOpen(true)}
          onBlur={() => setFiltering(false)}
          onKeyDown={onKeyDown} />
        <ChevronDown aria-hidden="true" className={cn('atlas-select-chevron', isOpen && 'atlas-rotated')}
          onPointerDown={(event) => { event.preventDefault(); inputRef.current?.focus(); setIsOpen((open) => !open); }} />
      </div>
      {layer && list ? createPortal(list, layer) : list}
    </div>
  );
}
