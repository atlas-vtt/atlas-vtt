import React from 'react';
import { typedDistance } from '../../../grid/typedDistance';

/** A collection's cells span at least one game unit. */
const MIN_DISTANCE = 1;

interface UnitDistanceFieldProps {
  value: number;
  onChange: (distance: number) => void;
}

/** The distance `text` gives a collection, null when it gives none. */
function distanceOf(text: string): number | null {
  const distance = typedDistance(text);
  return typeof distance === 'number' && distance >= MIN_DISTANCE ? distance : null;
}

/**
 * The distance one cell spans, as text: a number field takes only the system's decimal sign and
 * drops the other one, so "1.5" typed on a system that writes "1,5" became 15. Every distance
 * typed is handed on at once; text that is none keeps the last one, which shows again on leaving.
 */
export function UnitDistanceField({ value, onChange }: UnitDistanceFieldProps): React.ReactElement {
  const [draft, setDraft] = React.useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="decimal"
      className="atlas-csm-input atlas-csm-input--number"
      value={draft ?? String(value)}
      aria-invalid={(draft !== null && distanceOf(draft) === null) || undefined}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const distance = distanceOf(text);
        if (distance !== null) onChange(distance);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
