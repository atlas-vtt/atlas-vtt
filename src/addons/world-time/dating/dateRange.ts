import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { toOrdinal } from '../calendar/dateMath';
import { parseWorldDate } from '../calendar/worldDate';

/**
 * A span of days, both ends inclusive. Open ends are infinite. A date known only
 * to the year covers the whole year: `from: "1236"` starts on its first day,
 * `to: "1236"` ends on its last.
 */
export interface DaySpan {
  start: number;
  end: number;
}

/** Dates as objects and notes store them (storage strings, possibly absent). */
export interface DateBounds {
  from?: string | undefined;
  to?: string | undefined;
}

export const OPEN_SPAN: Readonly<DaySpan> = { start: -Infinity, end: Infinity };

/** The days `bounds` covers; null when neither end is a readable date (the object is undated). */
export function spanOf(calendar: CalendarDefinition, bounds: DateBounds): DaySpan | null {
  const from = parseWorldDate(bounds.from);
  const to = parseWorldDate(bounds.to);
  if (!from && !to) return null;
  const span = {
    start: from ? toOrdinal(calendar, from, 'start') : -Infinity,
    end: to ? toOrdinal(calendar, to, 'end') : Infinity,
  };
  // A range that ends before it starts is a typo; showing the object beats losing it.
  return span.start <= span.end ? span : null;
}

/** The days a viewing date covers: one day, or the whole month/year it names. */
export function viewingSpan(calendar: CalendarDefinition, viewingDate: string | null | undefined): DaySpan | null {
  const date = parseWorldDate(viewingDate);
  if (!date) return null;
  return { start: toOrdinal(calendar, date, 'start'), end: toOrdinal(calendar, date, 'end') };
}

export function spansOverlap(a: DaySpan, b: DaySpan): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * How a dated object shows at the viewing date:
 * - `visible`: it exists then (or is undated, or no viewing date is set);
 * - `ghost`: it does not, but the GM asked to see such objects faintly;
 * - `hidden`: it does not exist then.
 */
export type TimeVisibility = 'visible' | 'ghost' | 'hidden';

export function timeVisibility(objectSpan: DaySpan | null, viewing: DaySpan | null, showGhosted: boolean): TimeVisibility {
  if (!objectSpan || !viewing) return 'visible';
  if (spansOverlap(objectSpan, viewing)) return 'visible';
  return showGhosted ? 'ghost' : 'hidden';
}
