import React, { useId, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import type { TemplateField } from '../../model/templateTypes';
import { quoted } from '../../values/valueText';
import { t } from '../../../i18n';

export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * The options offered that contain the typed text (all of them before anything
 * is typed), and "Use “Swamp fey”" where the field takes any text.
 */
export function choiceOptions(field: Pick<TemplateField, 'options' | 'open'>, typed: string, offered: readonly string[] = field.options ?? []): ChoiceOption[] {
  const wanted = typed.trim().toLowerCase();
  const options = offered.filter((option) => option.toLowerCase().includes(wanted));
  const listed = options.map((option) => ({ value: option, label: option }));
  const exact = (field.options ?? []).some((option) => option.toLowerCase() === wanted);
  return field.open && wanted && !exact ? [...listed, { value: typed.trim(), label: t('statblockEditor.useTyped', { value: quoted(typed.trim()) }) }] : listed;
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

export interface OptionList {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Props for the input the list hangs from: the combobox's ARIA. */
  inputProps: Pick<React.InputHTMLAttributes<HTMLInputElement>, 'role' | 'aria-autocomplete' | 'aria-expanded' | 'aria-controls' | 'aria-activedescendant'>;
  /** ↑/↓ move through the list (opening it first), Enter takes the highlighted option, Escape closes it; true when it took the key. */
  onKey: (event: React.KeyboardEvent<HTMLInputElement>) => boolean;
  /** Opens the list with every option and none highlighted, so Enter still means "done". */
  show: () => void;
  /** Typing highlights the first option that matches, which Enter takes. */
  restart: () => void;
  list: React.ReactNode;
}

/**
 * The options of a choice, hanging under its input like a menu (§7.6). Focus
 * stays in the input throughout, so picking never blurs what was typed.
 */
export function useOptionList(label: string, options: readonly ChoiceOption[], onPick: (value: string) => void): OptionList {
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  // -1 while nothing is highlighted: the list opened with its input, and nothing was typed or stepped to yet.
  const [active, setActive] = useState(-1);
  const shown = open && options.length > 0;
  const keepInView = useKeepInView(listRef, shown, 'bottom');
  const current = active < 0 ? -1 : Math.min(active, options.length - 1);

  const pick = (value: string): void => {
    setOpen(false);
    setActive(-1);
    onPick(value);
  };

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
    const step = STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive(Math.min(Math.max(current + step, 0), Math.max(options.length - 1, 0)));
      if (!open && step > 0) setActive(0);
      return true;
    }
    if (shown && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return true;
    }
    const chosen = options[current];
    if (shown && event.key === 'Enter' && chosen) {
      event.preventDefault();
      pick(chosen.value);
      return true;
    }
    return false;
  };

  const list = shown ? (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={label}
      className={cn('atlas-sb-pane-options', keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
    >
      {options.map((option, index) => (
        <div
          key={`${option.value}-${index}`}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === current}
          className={cn('atlas-sb-pane-option', index === current && 'is-active')}
          // Keeps focus in the input, so picking never blurs (and commits) what was typed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(option.value)}
        >
          {option.label}
        </div>
      ))}
    </div>
  ) : null;

  return {
    open,
    setOpen,
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': shown,
      'aria-controls': shown ? listId : undefined,
      'aria-activedescendant': shown && options[current] ? `${listId}-${current}` : undefined,
    },
    onKey,
    show: () => {
      setActive(-1);
      setOpen(true);
    },
    restart: () => {
      setActive(0);
      setOpen(true);
    },
    list,
  };
}
