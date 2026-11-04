import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useListPlacement } from './selectListPlacement';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A quiet word after the label in the list ("Built-in"); the closed select shows the label alone. */
  detail?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Id of the visible label element. `aria-labelledby` keeps the name off the DOM as an attribute, so Obsidian does not turn it into a hover tooltip. */
  labelledBy: string;
  disabled?: boolean;
  /**
   * Where the list opens: an element over the view that clips nothing (a
   * dialog's overlay). Set it where what holds the select clips its content:
   * the list then floats over it, placed by the trigger, and opening it moves
   * nothing. Unset, the list hangs from the trigger.
   */
  layer?: HTMLElement | null | undefined;
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** Single-choice select with Atlas styling instead of the native popup; arrow keys move, Enter picks, Escape closes. */
export function Select<T extends string>({ value, options, onChange, labelledBy, disabled = false, layer = null }: SelectProps<T>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find(option => option.value === value);
  const { fit, style } = useListPlacement(isOpen, triggerRef, listRef, layer, options.length);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const close = (): void => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const pick = (next: T): void => {
    if (next !== value) onChange(next);
    close();
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent): void => {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    if (isOpen) return;
    const index = options.findIndex(option => option.value === value);
    const next = options[Math.min(options.length - 1, Math.max(0, index + step))];
    if (next) onChange(next.value);
  };

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      buttons[Math.min(buttons.length - 1, Math.max(0, current + step))]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    }
  };

  const list = isOpen && <div ref={listRef} id={listId} role="listbox" aria-labelledby={labelledBy} onKeyDown={onListKeyDown}
    className={cn('atlas-select-content', fit.up && 'atlas-select-content--up', layer && 'atlas-select-content--layered')}
    style={layer ? style : fit.maxHeight === null ? undefined : { maxHeight: fit.maxHeight }}>
    {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value}
      className={cn('atlas-select-option', option.value === value && 'atlas-selected')} onClick={() => pick(option.value)}>
      <span className="atlas-select-option-text">{option.label}</span>
      {option.detail && <span className="atlas-select-option-detail">{option.detail}</span>}
      <Check aria-hidden="true" className="atlas-select-check" />
    </button>)}
  </div>;

  return <div ref={rootRef} className={cn('atlas-select', isOpen && 'atlas-open')}>
    <button ref={triggerRef} type="button" role="combobox" aria-labelledby={labelledBy} aria-haspopup="listbox"
      aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined} disabled={disabled}
      className={cn('atlas-select-trigger', isOpen && 'atlas-open')}
      onClick={() => setIsOpen(open => !open)} onKeyDown={onTriggerKeyDown}>
      <span className="atlas-select-value">{selected?.label}</span>
      <ChevronDown aria-hidden="true" className={cn('atlas-select-chevron', isOpen && 'atlas-rotated')} />
    </button>
    {layer && list ? createPortal(list, layer) : list}
  </div>;
}
