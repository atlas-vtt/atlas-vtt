import React, { useId } from 'react';
import { Slider } from '../../packages/components/primitives/slider';

/** The slider field of the lighting popovers (a light's and a light zone's). */

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
