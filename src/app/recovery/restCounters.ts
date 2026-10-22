/**
 * The changes a rest makes to the rows of a Counters field that a rule names: uses given back by a
 * number, a share of each row, left at a number, or spent. Every change keeps each row within 0 and
 * its maximum and touches only the rows the rule names (`restoresRow`) that have uses at all. Pure.
 */

import type { FieldValue, TemplateField } from '../statblocks/model/templateTypes';
import { restoresRow, type CounterRowFilter } from '../statblocks/values/counterRestore';
import { isDrawnCounter, shownCounterRows, withCountersUsed, type CounterRow } from '../statblocks/values/counterValues';

type CountersField = Pick<TemplateField, 'counterRows'>;

const named = (rows: CounterRowFilter) => (row: CounterRow): boolean => isDrawnCounter(row) && restoresRow(rows, row);

/** The uses left over the rows `rows` names; 0 where the value is no list of counters. */
export function countersLeft(field: CountersField, value: FieldValue | undefined, rows: CounterRowFilter): number {
  return (shownCounterRows(field, value) ?? []).filter(named(rows)).reduce((sum, row) => sum + row.max - row.used, 0);
}

/** The value with each named row's uses set by `used` (given the row, answering its new count of used); null where nothing changes. */
function withNamedRows(field: CountersField, value: FieldValue | undefined, rows: CounterRowFilter, used: (row: CounterRow) => number): FieldValue | null {
  const shown = shownCounterRows(field, value);
  if (!shown) return null;
  const counts = shown.map((row) => (named(rows)(row) ? Math.max(0, Math.min(row.max, used(row))) : row.used));
  return counts.some((count, index) => count !== shown[index]!.used) ? withCountersUsed(field, value, counts) : null;
}

/** Each named row given `uses` back. */
export function regainedRows(field: CountersField, value: FieldValue | undefined, rows: CounterRowFilter, uses: number): FieldValue | null {
  return withNamedRows(field, value, rows, (row) => row.used - Math.max(0, uses));
}

/** Each named row given back `share` of its maximum, rounded `round`, at least `min`. */
export function sharedRows(
  field: CountersField, value: FieldValue | undefined, rows: CounterRowFilter, share: number, round: 'down' | 'up', min: number,
): FieldValue | null {
  const back = (max: number): number => Math.max(min, round === 'down' ? Math.floor(share * max) : Math.ceil(share * max));
  return withNamedRows(field, value, rows, (row) => row.used - back(row.max));
}

/** Each named row with `left` uses left. */
export function rowsLeftAt(field: CountersField, value: FieldValue | undefined, rows: CounterRowFilter, left: number): FieldValue | null {
  return withNamedRows(field, value, rows, (row) => row.max - left);
}

/** `units` uses spent over the named rows, from the first row with uses left on. */
export function spentRows(field: CountersField, value: FieldValue | undefined, rows: CounterRowFilter, units: number): FieldValue | null {
  let owed = units;
  return withNamedRows(field, value, rows, (row) => {
    const taken = Math.min(owed, row.max - row.used);
    owed -= taken;
    return row.used + taken;
  });
}
