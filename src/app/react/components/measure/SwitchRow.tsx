import React, { useId } from 'react';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

interface SwitchRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Why the switch cannot be pressed now: it is shown as it is, disabled, and says so when pointed at. */
  unavailable?: string | null;
}

/** One switch of a measurement's popover, named by the text before it. */
export function SwitchRow({ label, value, onChange, unavailable = null }: SwitchRowProps): React.ReactElement {
  const id = useId();
  const toggle = <ToggleSwitch size="s" value={value} labelledBy={id} disabled={unavailable !== null} onChange={() => onChange(!value)} />;
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{label}</span>
      {unavailable === null ? toggle : <LabelTooltip label={unavailable} describe>{toggle}</LabelTooltip>}
    </div>
  );
}
