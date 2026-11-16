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

/**
 * The sheet a pattern of the block bound to `key` reads: where `key` is a tracked number, it reads
 * that number's current value ("{glory|lookup:ranks}" names the rank the character holds now), not
 * the note's maximum; other keys read as the sheet does.
 */
export function readingTrackedCurrent(key: FieldKey, sheet: SheetState): SheetState {
  const tracked = trackedShown(key, sheet);
  if (!tracked) return sheet;
  const { reader } = sheet;
  return { ...sheet, reader: (ref) => (ref === key ? tracked.current : reader(ref)) };
}

/**
 * "2 / 3": a tracked number's current value over its maximum, or what the block's own pattern writes
 * of it (`children`), with the surface's controls around it where it has any (`ValueEditing.tracked`).
 */
export function TrackedText({ field, value, children }: { field: FieldKey; value: ResourceValue; children?: React.ReactNode }): React.ReactNode {
  const editing = useContext(ValueEditingContext);
  const text = children ?? (
    <span className="atlas-sb-value atlas-sb-tracked">
      {value.current}
      <span className="atlas-sb-tracked__max"> / {value.max}</span>
    </span>
  );
  return editing?.tracked ? editing.tracked(field, value, text) : text;
}
