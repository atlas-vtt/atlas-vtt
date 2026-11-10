import React from 'react';
import { InfoMark } from './InfoMark';

interface SwitchRowProps {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** A setting of the dice lab that is on or off: its name and info mark, the switch at the row's end. */
export function SwitchRow({ label, hint, checked, disabled, onChange }: SwitchRowProps): React.ReactElement {
  return (
    <div className="atlas-dice-lab__option">
      <span className="atlas-dice-lab__option-label">
        <span>{label}</span>
        <InfoMark label={hint} />
      </span>
      <label className="atlas-csm-switch">
        <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="atlas-csm-switch-track" />
      </label>
    </div>
  );
}
