import { bookLine, MAX_BOOK_TITLE } from './bookText.ts';
import { MAX_FORMULA } from './dice.ts';
import { isRecord } from './shape.ts';
import { spendText, type SheetBudget } from './sheetValues.ts';

/** The most rows one Counters block holds, the largest maximum of a row, and the most refills a block names. */
export const MAX_COUNTERS = 24;
export const MAX_COUNTER = 1000;
export const MAX_REFILLS = 8;

/**
 * One row of a Counters block: something with limited uses (a level's spell slots, ki, a feature's uses
 * per day). `used` of `max` are spent; `reset` names what gives them back: the id of one of the
 * character's recovery buttons, or for a GM's Atlas of earlier builds one of the statblock's `refills`
 * ("Long rest", "Dawn", "Session"); null for none. `regain` is the dice formula of how many come back
 * then ("1d6+1"), null for all of them. As the note stores it.
 */
export interface SheetCounter {
  readonly name: string;
  readonly max: number;
  readonly used: number;
  readonly reset: string | null;
  readonly regain: string | null;
}

/**
 * A moment that gives uses back, as the template names it once for the whole sheet, and the other
 * refills it brings along ("Long rest" also does what "Short rest" does). A row anywhere on the sheet
 * whose `reset` is the refill's name or one of those it includes is refilled by it.
 */
export interface CounterRefill {
  readonly name: string;
  readonly includes: readonly string[];
}

const isWhole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/** A row of a Counters block, or null when it is malformed: a name, a whole maximum, as many used as that at most. */
export function parseCounter(value: unknown): SheetCounter | null {
  if (!isRecord(value) || !isWhole(value.max, MAX_COUNTER) || !isWhole(value.used, value.max)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const reset = value.reset === undefined || value.reset === null ? null : bookLine(value.reset, MAX_BOOK_TITLE) ?? undefined;
  const regain = value.regain === undefined || value.regain === null ? null : bookLine(value.regain, MAX_FORMULA) ?? undefined;
  if (name === null || reset === undefined || regain === undefined) return null;
  return { name, max: value.max, used: value.used, reset, regain };
}

/** A refill of a Counters block, or null when it is malformed. */
export function parseRefill(value: unknown): CounterRefill | null {
  if (!isRecord(value) || !Array.isArray(value.includes) || value.includes.length > MAX_REFILLS) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const includes = value.includes.map((other) => bookLine(other, MAX_BOOK_TITLE));
  return name === null || includes.some((other) => other === null) ? null : { name, includes: includes as string[] };
}

/** The rows a refill gives uses back to: those whose `reset` is its name or one it includes. */
export function refilledBy(refill: CounterRefill, row: SheetCounter): boolean {
  return row.reset !== null && (row.reset === refill.name || refill.includes.includes(row.reset));
}

/** The refills of a statblock, each name once; null when they are malformed. */
export function parseRefills(value: unknown, budget: SheetBudget): CounterRefill[] | null {
  if (value === undefined) return [];
  const refills = Array.isArray(value) && value.length <= MAX_REFILLS ? value.map(parseRefill) : null;
  if (refills === null || refills.some((refill) => refill === null)) return null;
  const named = refills as CounterRefill[];
  if (new Set(named.map((refill) => refill.name)).size !== named.length) return null;
  return spendText(budget, named.map((refill) => refill.name + refill.includes.join('')).join('')) ? named : null;
}
