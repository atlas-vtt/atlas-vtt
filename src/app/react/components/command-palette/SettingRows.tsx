import React from 'react';
import { Slider } from '../../../packages/components/primitives/slider';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';

interface SettingRowProps {
  label: string;
  /** Id for the visible label, so the control can point `aria-labelledby` at it. */
  labelId?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}

/** One settings row: name and optional hint on the left, control on the right. */
export function SettingRow({ label, labelId, hint, children }: SettingRowProps): React.ReactElement {
  return (
    <div className="atlas-setting-row">
      <div className="atlas-setting-row-info">
        <span id={labelId} className="atlas-setting-label">{label}</span>
        {hint && <span className="atlas-setting-hint">{hint}</span>}
      </div>
      <div className="atlas-setting-row-control">{children}</div>
    </div>
  );
}

interface SettingToggleRowProps {
  label: string;
  hint?: string | undefined;
  value: boolean;
  onToggle: () => void;
}

/** Setting row with the shared `.atlas-toggle` switch. */
export function SettingToggleRow({ label, hint, value, onToggle }: SettingToggleRowProps): React.ReactElement {
  const labelId = React.useId();
  return (
    <SettingRow label={label} labelId={labelId} hint={hint}>
      <ToggleSwitch value={value} onChange={onToggle} labelledBy={labelId} />
    </SettingRow>
  );
}

interface SettingChoiceRowProps {
  label: string;
  hint?: string | undefined;
  /** The choice, a `SegmentedControl` as wide as the row. */
  children: React.ReactNode;
}

/** Name and hint above a full-width choice: for a segmented control whose options would squeeze a hint beside them. */
export function SettingChoiceRow({ label, hint, children }: SettingChoiceRowProps): React.ReactElement {
  return (
    <div className="atlas-setting-group">
      <div className="atlas-setting-row-info">
        <span className="atlas-setting-label">{label}</span>
        {hint && <span className="atlas-setting-hint">{hint}</span>}
      </div>
      <div className="atlas-setting-choice">{children}</div>
    </div>
  );
}

interface SettingSliderRowProps {
  label: string;
  hint?: string | undefined;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

/** Label above a full-width slider with a monospace readout. */
export function SettingSliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: SettingSliderRowProps): React.ReactElement {
  const labelId = React.useId();
  return (
    <div className="atlas-setting-group">
      <div className="atlas-setting-row-info">
        <span id={labelId} className="atlas-setting-label">{label}</span>
        {hint && <span className="atlas-setting-hint">{hint}</span>}
      </div>
      <div className="atlas-setting-slider-group">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(next: number[]) => onChange(next[0] ?? value)}
          className="atlas-setting-slider"
          aria-labelledby={labelId}
        />
        <span className="atlas-setting-value">{displayValue}</span>
      </div>
    </div>
  );
}
