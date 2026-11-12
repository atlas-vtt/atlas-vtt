import React, { useId } from 'react';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';

/** One switch of a measurement's popover, named by the text before it; `disabled` shows it as it is and takes no press. */
export function SwitchRow({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{label}</span>
      <ToggleSwitch size="s" value={value} labelledBy={id} disabled={disabled} onChange={() => onChange(!value)} />
    </div>
  );
}
