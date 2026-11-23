import React, { useId, useRef } from 'react';
import { Button } from './button';
import { LabelTooltip, TooltipProvider } from './tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Drawn before the label. */
  icon?: React.ReactNode;
  /** Names an option whose icon stands alone (an empty `label`) for assistive technology. */
  ariaLabel?: string;
  /** Shown and focusable, but not to be chosen; `hint` says why. */
  disabled?: boolean;
  hint?: string;
  /** A key that chooses the option, shown in its tooltip beside the hint (or the label). */
  shortcut?: string;
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
  /**
   * With `roving`: the arrow keys, Home and End choose the option they move to, as a WAI-ARIA radio group
   * does, passing options that are not to be chosen. For a choice that costs nothing to try.
   */
  followFocus?: boolean;
  /** A selector of the surface the control stands in, so its options' tooltips never cover its other controls (`LabelTooltip`'s `outside`). */
  tooltipOutside?: string;
  /** Where an option's tooltip stands when the option is at neither side edge of that surface. */
  tooltipSide?: 'top' | 'bottom';
  className?: string;
}

const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Where an arrow key, Home or End moves focus among `count` options, wrapping at the ends. */
function nextIndex(count: number, at: number, key: string, step: number | undefined): number {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return (at + (step ?? 0) + count) % count;
}

/** The same move, passing options that are not to be chosen; null where none other can be. */
function nextChoosable<T extends string>(options: readonly SegmentedOption<T>[], at: number, key: string, step: number | undefined): number | null {
  const choosable = (index: number): boolean => options[index]?.disabled !== true;
  const count = options.length;
  if (key === 'Home' || key === 'End') {
    const order = [...options.keys()];
    const found = (key === 'Home' ? order : order.reverse()).find(choosable);
    return found ?? null;
  }
  for (let moved = 1; moved < count; moved++) {
    const index = (at + (step ?? 0) * moved + count * count) % count;
    if (choosable(index)) return index;
  }
  return null;
}

/** A row of mutually exclusive choices, one of them active. */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, disabled = false, roving = false, followFocus = false, tooltipOutside, tooltipSide, className }: SegmentedControlProps<T>): React.JSX.Element {
  const labelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = STEPS[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.atlas-segmented__option') ?? [])];
    const at = all.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = followFocus ? nextChoosable(options, at, event.key, step) : nextIndex(all.length, at, event.key, step);
    if (next === null) return;
    all[next]?.focus();
    const option = options[next];
    if (followFocus && option && !disabled && option.value !== value) onChange(option.value);
  };

  const control = (
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
            aria-label={option.ariaLabel}
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
        return option.hint || option.shortcut
          ? <LabelTooltip key={option.value} label={option.hint ?? option.label} {...(option.shortcut && { shortcut: option.shortcut })} {...(tooltipOutside && { outside: tooltipOutside, sideOffset: 8 })} {...(tooltipSide && { side: tooltipSide })} describe multiline={!!option.hint}>{button}</LabelTooltip>
          : button;
      })}
    </div>
  );
  // Hinted options share one provider: moving from one to the next opens its hint at once instead of
  // after each option's own delay, which showed a hint only where the pointer rested.
  return options.some((option) => option.hint || option.shortcut) ? <TooltipProvider delayDuration={300} skipDelayDuration={600}>{control}</TooltipProvider> : control;
}
