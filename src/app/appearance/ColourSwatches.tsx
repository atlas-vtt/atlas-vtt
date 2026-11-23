import React, { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ACCENT_PRESETS, presetOfAccent } from './accentColour';
import { LabelTooltip } from '../packages/components/primitives/tooltip';
import { t } from '../i18n';
import './accent-colour.scss';

const BASE = 'base';
const CUSTOM = 'custom';
/** Every swatch in order: the colour that applies while none is picked, the presets by id, then the GM's own colour. */
const CHOICES: readonly string[] = [BASE, ...ACCENT_PRESETS.map((preset) => preset.id), CUSTOM];

/** The first swatch: what applies while no colour is picked (the look's own accent, the ivy's own greens). */
export interface BaseSwatch {
  label: string;
  className: string;
  style?: React.CSSProperties | undefined;
}

interface ColourSwatchesProps {
  /** Names the group for screen readers. */
  label: string;
  /** The colour picked, `#rrggbb` in any case; `''` while the base swatch's applies. */
  value: string;
  base: BaseSwatch;
  disabled?: boolean;
  onChange: (hex: string) => void;
  /** Where the colour picker opens while no colour is picked, read as it opens. */
  pickerStart: (doc: Document) => string;
  groupRef?: React.Ref<HTMLDivElement>;
}

/** A colour setting's swatches: the base, the presets and a colour of the GM's from the system picker, as one radio group. */
export function ColourSwatches({ label, value, base, disabled = false, onChange, pickerStart, groupRef }: ColourSwatchesProps): React.JSX.Element {
  const chosen = value === '' ? BASE : presetOfAccent(value)?.id ?? CUSTOM;
  const swatches = useRef(new Map<string, HTMLElement>());
  const picker = useRef<HTMLInputElement>(null);
  const [start, setStart] = useState('#808080');

  const pick = (choice: string): void => {
    if (choice === BASE) onChange('');
    else if (choice !== CUSTOM) onChange(ACCENT_PRESETS.find((preset) => preset.id === choice)?.hex ?? '');
  };

  const openCustom = (): void => {
    const input = picker.current;
    if (!input) return;
    if (value === '') flushSync(() => setStart(pickerStart(input.ownerDocument)));
    openPicker(input);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // From the swatch with focus, which is the chosen one unless the keys went on to Custom.
    const focused = CHOICES.findIndex((choice) => swatches.current.get(choice) === event.target);
    const next = choiceAfterKey(event.key, focused >= 0 ? focused : CHOICES.indexOf(chosen));
    if (!next) return;
    event.preventDefault();
    // The welcome wizard pages with the same arrows; inside the swatches they move the choice.
    event.stopPropagation();
    // Moving onto Custom only offers it: Enter or Space opens the picker.
    pick(next);
    swatches.current.get(next)?.focus();
  };

  const swatchRef = (choice: string): ((element: HTMLElement | null) => void) => (element: HTMLElement | null): void => {
    if (element) swatches.current.set(choice, element);
    else swatches.current.delete(choice);
  };

  return (
    <div
      ref={groupRef}
      className={`atlas-accent-swatches${disabled ? ' atlas-accent-swatches--disabled' : ''}`}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKeyDown}
    >
      <Swatch
        label={base.label}
        chosen={chosen === BASE}
        disabled={disabled}
        className={base.className}
        style={base.style}
        swatchRef={swatchRef(BASE)}
        onPick={() => pick(BASE)}
      />
      {ACCENT_PRESETS.map((preset) => (
        <Swatch
          key={preset.id}
          label={t(preset.labelKey)}
          chosen={chosen === preset.id}
          disabled={disabled}
          style={{ background: preset.hex }}
          swatchRef={swatchRef(preset.id)}
          onPick={() => pick(preset.id)}
        />
      ))}
      <span className="atlas-accent-custom-wrap">
        <Swatch
          label={t('appearance.accentCustom')}
          chosen={chosen === CUSTOM}
          disabled={disabled}
          className="atlas-accent-swatch--custom"
          style={chosen === CUSTOM ? { background: value } : undefined}
          swatchRef={swatchRef(CUSTOM)}
          onPick={openCustom}
        />
        <input
          ref={picker}
          type="color"
          className="atlas-accent-picker"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          value={value || start}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </div>
  );
}

interface SwatchProps {
  label: string;
  chosen: boolean;
  disabled: boolean;
  className?: string;
  style?: React.CSSProperties | undefined;
  swatchRef: (element: HTMLElement | null) => void;
  onPick: () => void;
}

function Swatch({ label, chosen, disabled, className, style, swatchRef, onPick }: SwatchProps): React.JSX.Element {
  return (
    <LabelTooltip label={label}>
      <button
        ref={swatchRef}
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={label}
        disabled={disabled}
        tabIndex={chosen ? 0 : -1}
        className={`atlas-accent-swatch${className ? ` ${className}` : ''}`}
        style={style}
        onClick={onPick}
      />
    </LabelTooltip>
  );
}

/** Opens the colour picker of the custom swatch, as a click on it would. */
function openPicker(input: HTMLInputElement): void {
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // A picker that may not open from here (no user gesture) falls back to a click.
    }
  }
  input.click();
}

/** The swatch an arrow, Home or End key moves to, round the ends; null for any other key. */
function choiceAfterKey(key: string, at: number): string | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return CHOICES[(at + 1) % CHOICES.length]!;
    case 'ArrowLeft':
    case 'ArrowUp':
      return CHOICES[(at + CHOICES.length - 1) % CHOICES.length]!;
    case 'Home':
      return CHOICES[0]!;
    case 'End':
      return CHOICES[CHOICES.length - 1]!;
    default:
      return null;
  }
}
