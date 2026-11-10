/**
 * Edits of the rows a Counters field starts with (`TemplateField.counterRows`), each a new list: added,
 * changed, moved or removed. Pure; the template editor runs each as one step.
 */

import type { CounterPreset } from './templateTypes';

/** The uses a row added in the template editor starts with, so it shows on the card at once. */
export const NEW_COUNTER_MAX = 1;

/** The rows with a new one named `name` at the end. */
export function addedCounterRow(rows: readonly CounterPreset[], name: string): CounterPreset[] {
  return [...rows, { name, max: NEW_COUNTER_MAX }];
}

/** The rows with the one at `index` changed by `change`. */
export function changedCounterRow(rows: readonly CounterPreset[], index: number, change: (row: CounterPreset) => CounterPreset): CounterPreset[] {
  return rows.map((row, at) => (at === index ? change(row) : row));
}

/** The rows with the one at `from` moved to `to`; the same rows where either lies outside them. */
export function movedCounterRow(rows: readonly CounterPreset[], from: number, to: number): CounterPreset[] {
  const moved = rows[from];
  if (moved === undefined || to < 0 || to >= rows.length || to === from) return [...rows];
  const rest = rows.filter((_, at) => at !== from);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}

/** The rows without the one at `index`. */
export function removedCounterRow(rows: readonly CounterPreset[], index: number): CounterPreset[] {
  return rows.filter((_, at) => at !== index);
}
