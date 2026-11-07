/**
 * Counters getting their uses back, as a recovery button's counters rule restores them: the rows
 * of the given Counters fields that the rule names (every row, or those whose `reset` holds one
 * of the rule's button ids) get their uses back, all of them, or as many as their `regain`
 * formula rolls. Pure: the caller rolls (`RegainRoll`) and writes the fields it answers.
 */

import type { FieldValue, TemplateField } from '../model/templateTypes';
import { usedAfterRegain } from './counterRegain';
import { shownCounterRows, withCountersUsed, type CounterRow } from './counterValues';

/** A Counters field and what the note holds of it now. */
export interface CounterTarget {
  readonly field: TemplateField;
  readonly value: FieldValue | undefined;
}

/** A field whose uses came back: what it held, and what it holds now. */
export interface RestoredCounters {
  readonly field: TemplateField;
  readonly base: FieldValue | undefined;
  readonly next: FieldValue;
}

/** The rows a rule restores: every row, or those whose `reset` holds one of these recovery button ids. */
export type CounterRowFilter = 'all' | readonly string[];

/**
 * Rolls a row's regained formula, its roll named `flavor` ("Wand (Long rest)"), and answers the
 * total; null where it cannot be rolled, which refuses the whole restore.
 */
export type RegainRoll = (formula: string, flavor: string) => number | null;

/** Whether `rows` restores the row. */
export function restoresRow(rows: CounterRowFilter, row: Pick<CounterRow, 'reset'>): boolean {
  return rows === 'all' || (row.reset !== null && rows.includes(row.reset));
}

/** A field's uses once restored; null where nothing comes back, undefined where a roll could not be made. */
function restoredUses(rows: readonly CounterRow[], filter: CounterRowFilter, roll: RegainRoll, restName: string): number[] | null | undefined {
  let changed = false;
  const uses: number[] = [];
  for (const row of rows) {
    if (row.used === 0 || !restoresRow(filter, row)) {
      uses.push(row.used);
      continue;
    }
    const rolled = row.regain === null ? null : roll(row.regain, `${row.name} (${restName})`);
    if (row.regain !== null && rolled === null) return undefined;
    const used = usedAfterRegain(row.used, rolled);
    changed ||= used !== row.used;
    uses.push(used);
  }
  return changed ? uses : null;
}

/**
 * The fields among `targets` whose uses come back, in the order given, each with the rows `rows`
 * names restored (`restName` names the rolls: "Long rest"); an empty list where nothing comes back.
 * Null where a regained formula could not be rolled. A field whose value is no list of counters
 * stays as it is.
 */
export function restoreCounters(targets: readonly CounterTarget[], rows: CounterRowFilter, roll: RegainRoll, restName: string): RestoredCounters[] | null {
  const restored: RestoredCounters[] = [];
  for (const { field, value } of targets) {
    const shown = shownCounterRows(field, value);
    if (shown === null) continue;
    const uses = restoredUses(shown, rows, roll, restName);
    if (uses === undefined) return null;
    if (uses === null) continue;
    const next = withCountersUsed(field, value, uses);
    if (next !== null) restored.push({ field, base: value, next });
  }
  return restored;
}
