import React from 'react';
import { Slider } from '../../../packages/components/primitives/slider';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';

interface SettingRowProps {
  label: string;
  /** Id for the visible label, so the control can point `aria-labelledby` at it. */
  labelId?: string | undefined;
  hint?: string | undefined;
  /** What the hint says in the row's other state: its room is kept, so the row has one size in both. */
  otherHint?: string | undefined;
  children: React.ReactNode;
}

/** One settings row: name and optional hint on the left, control on the right. */
export function SettingRow({ label, labelId, hint, otherHint, children }: SettingRowProps): React.ReactElement {
  return (
    <div className="atlas-setting-row">
      <div className="atlas-setting-row-info">
        <span id={labelId} className="atlas-setting-label">{label}</span>
        {hint && otherHint ? (
          <span className="atlas-setting-hints">
            <span className="atlas-setting-hint">{hint}</span>
            <span className="atlas-setting-hint" aria-hidden="true">{otherHint}</span>
          </span>
        ) : hint && <span className="atlas-setting-hint">{hint}</span>}
      </div>
      <div className="atlas-setting-row-control">{children}</div>
    </div>
  );
}

interface SettingToggleRowProps {
  label: string;
  hint?: string | undefined;
  /** What the switch does while off, where `hint` says what it does while on: the row shows the one that holds and keeps room for both. */
  hintOff?: string | undefined;
  value: boolean;
  /** Shown but not switchable: what it sets means nothing right now. */
  disabled?: boolean;
  onToggle: () => void;
}

/** Setting row with the shared `.atlas-toggle` switch. */
export function SettingToggleRow({ label, hint, hintOff, value, disabled = false, onToggle }: SettingToggleRowProps): React.ReactElement {
  const labelId = React.useId();
  const shown = hintOff !== undefined && !value ? hintOff : hint;
  return (
    <SettingRow label={label} labelId={labelId} hint={shown} otherHint={hintOff !== undefined ? (value ? hintOff : hint) : undefined}>
      <ToggleSwitch value={value} onChange={onToggle} labelledBy={labelId} disabled={disabled} />
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
  disabled?: boolean;
  onChange: (value: number) => void;
  /** The drag ended or a key moved the value: where it came to rest. */
  onCommit?: (value: number) => void;
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
  disabled = false,
  onChange,
  onCommit,
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
          disabled={disabled}
          onValueChange={(next: number[]) => onChange(next[0] ?? value)}
          {...(onCommit && { onValueCommit: (next: number[]) => onCommit(next[0] ?? value) })}
          className="atlas-setting-slider"
          aria-labelledby={labelId}
        />
        <span className="atlas-setting-value">{displayValue}</span>
      </div>
    </div>
  );
}
