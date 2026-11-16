import React, { useId } from 'react';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
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
  const labelId = useId();
  return (
    <div className="atlas-dice-lab__option">
      <span className="atlas-dice-lab__option-label">
        <span id={labelId}>{label}</span>
        <InfoMark label={hint} />
      </span>
      <ToggleSwitch labelledBy={labelId} value={checked} disabled={disabled} onChange={() => onChange(!checked)} />
    </div>
  );
}
