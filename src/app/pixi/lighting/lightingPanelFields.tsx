import React, { useId } from 'react';
import { Button } from '../../packages/components/primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../packages/components/primitives/SegmentedControl';
import { Slider } from '../../packages/components/primitives/slider';
import { Toggle } from '../../packages/components/primitives/Toggle';

/** Fields shared by the lighting panels (`.atlas-light-panel`): a light's settings and the scene's. */

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

/** A colour from the system picker, picked in sRGB. */
export function ColorField({ label, value, onChange }: ColorFieldProps): React.ReactElement {
  const id = useId();
  return (
    <label className="atlas-light-panel__field atlas-light-panel__field--color" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

interface TintFieldProps {
  label: string;
  /** The tint, or null without one. */
  value: string | null;
  /** What the button that takes the tint back says: it is named by this text alone. */
  clearLabel: string;
  onChange: (color: string | null) => void;
}

/** A colour the scene may also leave unset: the picker, and a button to take it back. */
export function TintField({ label, value, clearLabel, onChange }: TintFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__choice atlas-light-panel__field--color">
      <label htmlFor={id}>{label}</label>
      <Button variant="ghost" size="sm" disabled={value === null} onClick={() => onChange(null)}>{clearLabel}</Button>
      <input id={id} type="color" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface ImageFieldProps {
  label: string;
  /** Vault path of the image, or null without one. */
  value: string | null;
  /** What the button that picks an image says while there is none. */
  chooseLabel: string;
  /** What the button that takes the image back says: it is named by this text alone. */
  clearLabel: string;
  onChoose: () => void;
  onClear: () => void;
}

/** An image from the vault the scene may also leave unset: a button naming it that picks another, and one to take it back. */
export function ImageField({ label, value, chooseLabel, clearLabel, onChoose, onClear }: ImageFieldProps): React.ReactElement {
  const labelId = useId();
  const buttonId = useId();
  const name = value?.split('/').pop() ?? null;
  return (
    <div className="atlas-light-panel__field">
      <span id={labelId}>{label}</span>
      <div className="atlas-light-panel__choice">
        <Button id={buttonId} variant="secondary" size="sm" className="atlas-light-panel__image" aria-labelledby={`${labelId} ${buttonId}`} onClick={onChoose}>
          {name ?? chooseLabel}
        </Button>
        <Button variant="ghost" size="sm" disabled={value === null} onClick={onClear}>{clearLabel}</Button>
      </div>
    </div>
  );
}

interface ChoiceFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}

/** One of a few choices, all in view, under its label. */
export function ChoiceField<T extends string>({ label, value, options, onChange }: ChoiceFieldProps<T>): React.ReactElement {
  return (
    <div className="atlas-light-panel__field atlas-light-panel__field--choice">
      <span aria-hidden="true">{label}</span>
      <SegmentedControl className="atlas-segmented--fit" value={value} options={options} ariaLabel={label} onChange={onChange} />
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown beside the label, e.g. "25 %"; nothing is shown without it. */
  display?: string;
  /** Shown, but not to be set: its value means nothing right now. */
  disabled?: boolean;
  onPointerDown?: (event: React.PointerEvent) => void;
  onChange: (value: number) => void;
  /** The drag ended or a key moved the value: where it came to rest. */
  onCommit?: (value: number) => void;
}

export function SliderField({ label, value, min, max, step, display, disabled = false, onPointerDown, onChange, onCommit }: SliderFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__slider">
      <div className="atlas-light-panel__slider-head">
        <span id={id}>{label}</span>
        {display !== undefined && <output aria-hidden="true">{display}</output>}
      </div>
      <Slider aria-labelledby={id} value={[value]} min={min} max={max} step={step} disabled={disabled}
        onValueChange={([next]) => onChange(next ?? value)} {...(onPointerDown && { onPointerDown })}
        {...(onCommit && { onValueCommit: ([next]: number[]) => onCommit(next ?? value) })} />
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  value: boolean;
  /** What the switch does in each state, shown as its tooltip. */
  tooltipOn: string;
  tooltipOff: string;
  onChange: (value: boolean) => void;
}

export function ToggleField({ label, value, tooltipOn, tooltipOff, onChange }: ToggleFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__toggle">
      <span id={id}>{label}</span>
      <Toggle value={value} onChange={() => onChange(!value)} tooltipOn={tooltipOn} tooltipOff={tooltipOff} labelledBy={id} />
    </div>
  );
}
