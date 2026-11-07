/**
 * Rolling on a table: its die looked up in its rows' ranges, or a pick by the
 * rows' weights where it has no die. Several draws may repeat a row, or not:
 * without repeats a drawn row is out of the table, and the die is rolled again
 * on its numbers, until the table is spent. Rows can be out of the table from the
 * start (a row that rolls its own table again). Pure.
 */

import { dieOdds, drawFromOdds, rollDie } from './dieOdds';
import { TABLE_LIMITS, type RandomTable, type TableDie, type TableRow } from './tableModel';

export interface TableDraw {
  /** The row that came up; null when the die landed on a number no row answers. */
  row: TableRow | null;
  /** The die and the number it rolled; absent for a table without a die. */
  roll?: { die: string; total: number };
}

export interface TableRollOptions {
  /** At most `TABLE_LIMITS.results`. */
  count: number;
  /** Never the same row twice; stops when every row has come up. */
  noRepeats?: boolean;
  /** Rows that never come up, their numbers rolled again as drawn rows' are without repeats. */
  exclude?: ReadonlySet<TableRow>;
  random?: () => number;
}

function answers(row: TableRow, total: number): boolean {
  return row.ranges.some((range) => total >= range.min && total <= range.max);
}

/** The first row answering `total` that has not been drawn; null for a gap or a number only drawn rows answer. */
function rowAt(rows: readonly TableRow[], total: number, drawn: ReadonlySet<TableRow>): TableRow | null {
  return rows.find((row) => !drawn.has(row) && answers(row, total)) ?? null;
}

/** Whether only rows drawn already answer `total`: a number rolled again without repeats. */
function takenNumber(rows: readonly TableRow[], total: number, drawn: ReadonlySet<TableRow>): boolean {
  const answering = rows.filter((row) => answers(row, total));
  return answering.length > 0 && answering.every((row) => drawn.has(row));
}

/**
 * One roll of the die. Without repeats, a number only drawn rows answer is rolled
 * again: drawn at once from the numbers still open, with their odds, which is the
 * same as rolling until one comes up. Null once no open row can come up.
 */
function rollWithDie(table: RandomTable, die: TableDie, drawn: ReadonlySet<TableRow>, random: () => number): TableDraw | null {
  const draw = (total: number): TableDraw => ({ row: rowAt(table.rows, total, drawn), roll: { die: die.label, total } });
  if (drawn.size === 0) return draw(rollDie(die, random));
  const odds = dieOdds(die);
  const open = new Map([...odds].filter(([total]) => !takenNumber(table.rows, total, drawn)));
  const reachable = [...open.keys()].some((total) => rowAt(table.rows, total, drawn) !== null);
  if (!reachable) return null;
  const total = rollDie(die, random);
  if (open.has(total)) return draw(total);
  const again = drawFromOdds(open, random);
  return again === null ? null : draw(again);
}

/** A row by the rows' weights (all 1 without a weight column); null when none can come up. */
function pickByWeight(rows: readonly TableRow[], drawn: ReadonlySet<TableRow>, random: () => number): TableRow | null {
  const open = rows.filter((row) => row.weight > 0 && !drawn.has(row));
  const sum = open.reduce((total, row) => total + row.weight, 0);
  if (sum <= 0) return null;
  let pick = random() * sum;
  for (const row of open) {
    pick -= row.weight;
    if (pick < 0) return row;
  }
  return open[open.length - 1] ?? null;
}

/** `count` draws from the table, fewer when it is spent without repeats. */
export function rollTable(table: RandomTable, { count, noRepeats = false, exclude, random = Math.random }: TableRollOptions): TableDraw[] {
  const draws: TableDraw[] = [];
  const drawn = new Set<TableRow>(exclude);
  const die = table.hasRollColumn ? table.die : null;
  for (let i = 0; i < Math.min(count, TABLE_LIMITS.results); i++) {
    const draw = die ? rollWithDie(table, die, drawn, random) : (() => {
      const row = pickByWeight(table.rows, drawn, random);
      return row ? { row } : null;
    })();
    if (!draw) break;
    draws.push(draw);
    if (noRepeats && draw.row) drawn.add(draw.row);
  }
  return draws;
}
