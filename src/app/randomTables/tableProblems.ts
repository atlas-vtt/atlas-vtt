/**
 * What is wrong with a table's numbers: gaps no row answers, numbers more than
 * one row answers, numbers its die never rolls and roll cells that cannot be
 * read. Reported, never fixed: the note is the table. Pure.
 */

import { canRoll, reachableRuns } from './dieRanges';
import type { RollRange, TableDie, TableProblem, TableRow } from './tableModel';

type Coverage = 'gap' | 'overlap';

interface Segment {
  from: number;
  to: number;
  kind: Coverage;
}

/** The numbers checked for gaps and overlaps: those the die rolls, else those between the lowest and highest written. */
function domainOf(rows: readonly TableRow[], die: TableDie | null): RollRange[] {
  if (die) return reachableRuns(die);
  const finite = rows.flatMap((row) => row.ranges.flatMap((range) => [range.min, range.max])).filter(Number.isFinite);
  return finite.length > 0 ? [{ min: Math.min(...finite), max: Math.max(...finite) }] : [];
}

/** Runs of `domain` that no row or several rows answer, in order. */
function coverageSegments(rows: readonly TableRow[], domain: readonly RollRange[]): Segment[] {
  if (domain.length === 0) return [];
  const low = domain[0]!.min;
  const high = domain[domain.length - 1]!.max;
  const changes = new Map<number, number>([[low, 0], [high + 1, 0]]);
  for (const range of rows.flatMap((row) => row.ranges)) {
    const from = Math.max(range.min, low);
    const to = Math.min(range.max, high);
    if (from > to) continue;
    changes.set(from, (changes.get(from) ?? 0) + 1);
    changes.set(to + 1, (changes.get(to + 1) ?? 0) - 1);
  }
  const points = [...changes.keys()].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let count = 0;
  for (let i = 0; i < points.length - 1; i++) {
    count += changes.get(points[i]!)!;
    if (count === 1) continue;
    const kind: Coverage = count === 0 ? 'gap' : 'overlap';
    for (const run of domain) {
      const from = Math.max(points[i]!, run.min);
      const to = Math.min(points[i + 1]! - 1, run.max);
      if (from > to) continue;
      const last = segments[segments.length - 1];
      if (last && last.kind === kind && last.to + 1 === from) last.to = to;
      else segments.push({ from, to, kind });
    }
  }
  return segments.sort((a, b) => a.from - b.from);
}

function unreachable(rows: readonly TableRow[], die: TableDie): TableProblem[] {
  return rows.flatMap((row) => {
    const ends = new Set(row.ranges.flatMap((range) => [range.min, range.max]).filter(Number.isFinite));
    return [...ends].filter((value) => !canRoll(die, value)).map((value) => ({ kind: 'unreachable', row: row.index, value }) as const);
  });
}

/** Roll cells that name no number: rows of a roll column without ranges. */
function unreadableRolls(rows: readonly TableRow[]): TableProblem[] {
  return rows.flatMap((row) => (row.roll !== undefined && row.ranges.length === 0
    ? [{ kind: 'unreadable', row: row.index, column: 'roll', text: row.roll } as const]
    : []));
}

/** The problems of a table's roll column, with `die` as read; none without a roll column. */
export function tableProblems(rows: readonly TableRow[], die: TableDie | null, hasRollColumn: boolean): TableProblem[] {
  if (!hasRollColumn) return [];
  const segments = coverageSegments(rows, domainOf(rows, die)).map(({ from, to, kind }) => ({ kind, from, to }));
  return [...unreadableRolls(rows), ...(die ? unreachable(rows, die) : []), ...segments];
}
