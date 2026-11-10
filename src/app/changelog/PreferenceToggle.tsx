import React, { useId } from 'react';
import { ToggleLabel } from '../packages/components/primitives/Toggle';

interface Props {
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** Extra explanation for assistive technology; not shown as a tooltip. */
  hint?: string;
  onChange: (checked: boolean) => void;
}

/** A preference of the changelog: Atlas' switch with its text, and a hint only screen readers hear. */
export function PreferenceToggle({ label, checked, disabled = false, hint, onChange }: Props): React.JSX.Element {
  const hintId = useId();
  // The hint lives outside the switch's name, so it describes the switch without joining it.
  return <>
    <ToggleLabel label={label} value={checked} disabled={disabled} onChange={() => onChange(!checked)}
      {...(hint && { 'aria-describedby': hintId })} />
    {hint && <span id={hintId} className="atlas-changelog-visually-hidden">{hint}</span>}
  </>;
}
