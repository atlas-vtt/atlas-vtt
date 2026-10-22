import React, { useId, useRef } from 'react';
import { Button } from './button';
import { LabelTooltip } from './tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Drawn before the label. */
  icon?: React.ReactNode;
  /** Shown and focusable, but not to be chosen; `hint` says why. */
  disabled?: boolean;
  hint?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Names the choice for assistive technology, without the hover tooltip Obsidian adds for `aria-label`. */
  ariaLabel: string;
  /** Shown, but not to be chosen from right now. */
  disabled?: boolean;
  /**
   * One tab stop, the chosen option: the arrow keys, Home and End move focus between the options,
   * and Enter or Space chooses, so passing an option never chooses it.
   */
  roving?: boolean;
  className?: string;
}

const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** A row of mutually exclusive choices, one of them active. */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, disabled = false, roving = false, className }: SegmentedControlProps<T>): React.JSX.Element {
  const labelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = STEPS[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.atlas-segmented__option') ?? [])];
    const at = all.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    let next = (at + (step ?? 0) + all.length) % all.length;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    all[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className={`atlas-segmented${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-disabled={disabled || undefined}
      onKeyDown={roving ? onKeyDown : undefined}
    >
      <span id={labelId} hidden>{ariaLabel}</span>
      {options.map((option) => {
        const chosen = option.value === value;
        const inert = disabled || option.disabled === true;
        const button = (
          <Button
            key={option.value}
            variant="ghost"
            role="radio"
            aria-checked={chosen}
            disabled={disabled}
            aria-disabled={option.disabled || undefined}
            tabIndex={roving && !chosen ? -1 : undefined}
            className={`atlas-segmented__option${chosen ? ' atlas-active' : ''}${option.icon ? ' atlas-segmented__option--icon' : ''}`}
            onClick={() => { if (!inert) onChange(option.value); }}
          >
            {option.icon && <span className="atlas-segmented__icon" aria-hidden="true">{option.icon}</span>}
            {option.label}
          </Button>
        );
        return option.hint ? <LabelTooltip key={option.value} label={option.hint} describe>{button}</LabelTooltip> : button;
      })}
    </div>
  );
}
