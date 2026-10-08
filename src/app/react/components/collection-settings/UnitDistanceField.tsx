import React from 'react';
import { isUnitDistance, typedDistance } from '../../../grid/unitDistance';

interface UnitDistanceFieldProps {
  /** The distance in the settings being edited; anything that is no distance marks the field. */
  value: number;
  onChange: (distance: number) => void;
}

/**
 * The distance one cell spans, as text: a number field takes only the system's decimal sign and
 * drops the other one, so "1.5" typed on a system that writes "1,5" became 15. Like the range
 * bands it hands on whatever is typed, text that is no distance as NaN, so the settings can not
 * be saved until it is one.
 */
export function UnitDistanceField({ value, onChange }: UnitDistanceFieldProps): React.ReactElement {
  const [draft, setDraft] = React.useState<string | null>(null);
  const valid = isUnitDistance(value);

  return (
    <input
      type="text"
      inputMode="decimal"
      className="atlas-csm-input atlas-csm-input--number"
      value={draft ?? (valid ? String(value) : '')}
      aria-invalid={!valid || undefined}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        onChange(typedDistance(text) ?? NaN);
      }}
      onBlur={() => {
        // Text that is no distance stays to be corrected; a distance shows as it is stored.
        if (valid) setDraft(null);
      }}
    />
  );
}
