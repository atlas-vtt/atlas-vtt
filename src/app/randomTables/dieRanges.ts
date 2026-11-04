/**
 * The numbers of a table's roll column and the die they belong to: cells such
 * as `1`, `1–2`, `01–05`, `00`, `**3**`, `13,14`, `2 or less` and `12+`; the
 * die from the column's header, a "Roll 1d6" near the table or the highest
 * number; weights for tables without a die. Pure.
 */

import type { RollRange, TableDie } from './tableModel';

/** Numbers longer than this are no roll. */
const NUMBER = '(\\d{1,6})';
const DASH = '(?:-|–|—|‒|to)';
const SINGLE = new RegExp(`^${NUMBER}$`);
const SPAN = new RegExp(`^${NUMBER}\\s*${DASH}\\s*${NUMBER}$`, 'i');
const AT_MOST = new RegExp(`^(?:${NUMBER}\\s*(?:or (?:less|lower|fewer|below)|-|–|—)|(?:≤|<=)\\s*${NUMBER})$`, 'i');
const AT_LEAST = new RegExp(`^(?:${NUMBER}\\s*(?:\\+|or (?:more|higher|above))|(?:≥|>=)\\s*${NUMBER})$`, 'i');
/** A die as a header or Dice Roller's `dice: 1d20` names it. */
const DIE = /^(?:dice:\s*)?(\d{0,2})d(\d{1,4}|%)$/i;
/** "Roll 1d6", "roll a d6", "(d6)" in a heading or the line above a table. */
const DIE_IN_TEXT = /\broll(?:\s+(?:a|an|one))?\s+(\d{0,2})d(\d{1,4}|%)\b|\((\d{0,2})d(\d{1,4}|%)\)/i;
const WEIGHT_HEADER = /^(?:weight|wt|×)$/i;
const WEIGHT = /^\d{1,9}(?:\.\d{1,6})?$/;
/** The highest number of a roll column, read as the die that ends there. */
const DIE_BY_HIGHEST: ReadonlyMap<number, number> = new Map([[4, 4], [6, 6], [8, 8], [10, 10], [12, 12], [20, 20], [100, 100]]);
const MAX_DICE = 10;
const MAX_FACES = 1000;

/** A cell without the emphasis and code marks books and notes put around numbers. */
export function plainCell(cell: string): string {
  return cell.replace(/[*_`]/g, '').trim();
}

/** `00` is 100, as a d100 table writes it. */
function number(text: string): number {
  return text === '00' ? 100 : Number(text);
}

function readPart(part: string): RollRange | null {
  const single = SINGLE.exec(part);
  if (single) {
    const value = number(single[1]!);
    return { min: value, max: value };
  }
  const span = SPAN.exec(part);
  if (span) {
    const min = number(span[1]!);
    const max = number(span[2]!);
    return min <= max ? { min, max } : null;
  }
  const atMost = AT_MOST.exec(part);
  if (atMost) return { min: -Infinity, max: number(atMost[1] ?? atMost[2]!) };
  const atLeast = AT_LEAST.exec(part);
  if (atLeast) return { min: number(atLeast[1] ?? atLeast[2]!), max: Infinity };
  return null;
}

/** The numbers a roll cell names, or null when it is no number, range or list of them. */
export function readRollCell(cell: string): RollRange[] | null {
  const parts = plainCell(cell).split(',').map((part) => part.trim());
  if (parts.length > 32) return null;
  const ranges: RollRange[] = [];
  for (const part of parts) {
    const range = readPart(part);
    if (!range) return null;
    ranges.push(range);
  }
  return ranges;
}

/** Whether a cell starts like a roll: a digit or a bound (`≤2`). Such a cell that cannot be read is a problem. */
export function looksLikeRoll(cell: string): boolean {
  return /^(?:\d|≤|≥|<=|>=)/.test(plainCell(cell));
}

function die(count: number, faces: number): TableDie | null {
  if (count < 1 || count > MAX_DICE || faces < 2 || faces > MAX_FACES) return null;
  if (faces === 66) return count === 1 ? { label: 'd66', count: 2, faces: 6, d66: true } : null;
  return { label: `${count === 1 ? '' : count}d${faces}`, count, faces, d66: false };
}

function dieOf(count: string | undefined, faces: string): TableDie | null {
  return die(count ? Number(count) : 1, faces === '%' ? 100 : Number(faces));
}

/** The die a roll column's header names: `d6`, `2d6`, `d66`, `d%`, `dice: 1d20`. */
export function dieOfHeader(header: string): TableDie | null {
  const match = DIE.exec(plainCell(header));
  return match ? dieOf(match[1], match[2]!) : null;
}

/** The die a "Roll 1d6" in a heading or a line of text names. */
export function dieInText(text: string): TableDie | null {
  const match = DIE_IN_TEXT.exec(text);
  if (!match) return null;
  return match[2] !== undefined ? dieOf(match[1], match[2]) : dieOf(match[3], match[4]!);
}

/** Whether `value` is a d66 roll: tens and ones each 1 to 6. */
export function isD66Value(value: number): boolean {
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return Number.isInteger(value) && tens >= 1 && tens <= 6 && ones >= 1 && ones <= 6;
}

/** The die the numbers end on: 6 is a d6, 100 a d100; 66 with only d66 numbers a d66. */
export function dieOfNumbers(ranges: readonly RollRange[]): TableDie | null {
  const finite = ranges.flatMap((range) => [range.min, range.max]).filter(Number.isFinite);
  if (finite.length === 0) return null;
  const highest = Math.max(...finite);
  if (highest === 66 && finite.every(isD66Value)) return die(1, 66);
  const faces = DIE_BY_HIGHEST.get(highest);
  return faces === undefined ? null : die(1, faces);
}

/** The numbers `die` can roll, as runs of whole numbers. */
export function reachableRuns(table: TableDie): RollRange[] {
  if (table.d66) return [1, 2, 3, 4, 5, 6].map((tens) => ({ min: tens * 10 + 1, max: tens * 10 + 6 }));
  return [{ min: table.count, max: table.count * table.faces }];
}

export function canRoll(table: TableDie, value: number): boolean {
  return reachableRuns(table).some((run) => value >= run.min && value <= run.max);
}

/** Whether a column header names the weight column. */
export function isWeightHeader(header: string): boolean {
  return WEIGHT_HEADER.test(plainCell(header));
}

/** A weight cell's number above 0, or null when it is none. */
export function readWeight(cell: string): number | null {
  const text = plainCell(cell);
  if (!WEIGHT.test(text)) return null;
  const weight = Number(text);
  return weight > 0 ? weight : null;
}
