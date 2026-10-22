import React, { useContext } from 'react';
import type { ResourceValue } from '../../../resources/resourceTypes';
import type { FieldKey } from '../../model/templateTypes';
import { trackedMax, trackedValue } from '../../values/trackedNumbers';
import type { SheetState } from '../sheetState';
import { ValueEditingContext } from '../valueSlot';

/**
 * The value a tracked number shows: the note's maximum and the current value of the token the
 * statblock is shown for, else where it starts; null for a number the template does not track, or
 * whose maximum the note does not give.
 */
export function trackedShown(key: FieldKey, sheet: Pick<SheetState, 'tracked' | 'reader' | 'token'>): ResourceValue | null {
  const tracked = sheet.tracked.get(key);
  if (!tracked) return null;
  const max = trackedMax(tracked, sheet.reader);
  return max === null ? null : trackedValue(tracked, max, sheet.token?.resources?.[tracked.key]);
}

/** "2 / 3": a tracked number's current value over its maximum, with the surface's controls around it where it has any (`ValueEditing.tracked`). */
export function TrackedText({ field, value }: { field: FieldKey; value: ResourceValue }): React.ReactNode {
  const editing = useContext(ValueEditingContext);
  const text = (
    <span className="atlas-sb-value atlas-sb-tracked">
      {value.current}
      <span className="atlas-sb-tracked__max"> / {value.max}</span>
    </span>
  );
  return editing?.tracked ? editing.tracked(field, value, text) : text;
}
