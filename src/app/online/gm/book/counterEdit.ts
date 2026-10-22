import { isRecord, MAX_COUNTER, type SheetRaw } from '../../protocol/index.ts';
import type { FieldValue, TemplateField } from '../../../statblocks/model/templateTypes';
import { COUNTER_ROW_KEYS, readCounterRow, shownCounterRows, withCountersSet, type CounterRow } from '../../../statblocks/values/counterValues';

/**
 * The value a Counters field holds once a player's whole list is in, or null where it changes more
 * than uses and maximums: a page sends every row back (one pip, or a row's maximum), and only `used`
 * and `max` may differ from what the note holds now (its rows, or the template's preset rows where it
 * holds none), uses as a whole number up to the row's maximum, a changed maximum from 1 to
 * `MAX_COUNTER` (a row of none is not drawn, so a player never takes one away). Names, recovery
 * buttons and regained formulas (compared exactly, as written) and their order must be the note's,
 * and a row holds nothing else. A note whose rows are no counters is never changed. Every other key
 * a row of the note holds stays as it is.
 */
export function countersAfterEdit(field: TemplateField, stored: FieldValue | undefined, value: SheetRaw): FieldValue | null {
  const now = shownCounterRows(field, stored);
  if (!now || !Array.isArray(value) || value.length !== now.length) return null;
  const counts: Pick<CounterRow, 'max' | 'used'>[] = [];
  for (const [index, item] of value.entries()) {
    const was = now[index];
    const row = readCounterRow(item);
    if (!was || !row || !isRecord(item) || typeof item.used !== 'number' || Object.keys(item).some((key) => !COUNTER_ROW_KEYS.has(key))) return null;
    if (row.name !== was.name || row.reset !== was.reset || row.regain !== was.regain) return null;
    if (row.max !== was.max && (row.max < 1 || row.max > MAX_COUNTER)) return null;
    counts.push({ max: row.max, used: row.used });
  }
  return withCountersSet(field, stored, counts);
}
