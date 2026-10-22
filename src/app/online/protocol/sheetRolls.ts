import { bookLine } from './bookText.ts';
import { MAX_FORMULA } from './dice.ts';

/** A roll a value offers: undefined for none, null when it is malformed. */
export function parseRoll(value: unknown): string | null | undefined {
  return value === undefined ? undefined : bookLine(value, MAX_FORMULA);
}

/** The rolls of a table's cells, shaped as its cells (null for a cell that rolls nothing); undefined for none, null when malformed. */
export function parseCellRolls(value: unknown, cells: readonly (readonly unknown[])[]): (string | null)[][] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== cells.length) return null;
  const rows: (string | null)[][] = [];
  for (const [index, row] of value.entries()) {
    if (!Array.isArray(row) || row.length !== cells[index]?.length) return null;
    const rolls = row.map((roll) => (roll === null ? null : parseRoll(roll) ?? undefined));
    if (rolls.some((roll) => roll === undefined)) return null;
    rows.push(rolls as (string | null)[]);
  }
  return rows;
}
