import { monthOf, type CalendarDefinition } from './calendarDefinition';
import { precisionOf, type DatePrecision, type WorldDate } from './worldDate';

/**
 * Day arithmetic on a calendar. A date becomes an ordinal day number
 * (`year * daysPerYear + day of year`), which works across year 0 and for
 * negative years. A date known only to the year or month covers a span of
 * days: `edge` picks its first or last day.
 */
export type DateEdge = 'start' | 'end';

export type StepUnit = 'day' | 'month' | 'year' | 'decade' | 'century';

/** Day of the year (0-based) on which `month` begins. */
function monthStart(calendar: CalendarDefinition, month: number): number {
  let days = 0;
  for (const entry of calendar.months) {
    if (entry.n >= month) break;
    days += entry.days;
  }
  return days;
}

/** Keeps month and day inside the calendar, so a date from another calendar still orders sensibly. */
export function clampDate(calendar: CalendarDefinition, date: WorldDate): WorldDate {
  if (date.month === undefined) return { year: date.year };
  const month = Math.min(Math.max(1, date.month), calendar.months.length);
  if (date.day === undefined) return { year: date.year, month };
  const days = monthOf(calendar, month)?.days ?? 1;
  return { year: date.year, month, day: Math.min(Math.max(1, date.day), days) };
}

/** Why `date` does not exist in `calendar`, or null when it does. */
export function dateProblem(calendar: CalendarDefinition, date: WorldDate): string | null {
  if (date.month === undefined) return null;
  const month = monthOf(calendar, date.month);
  if (!month) return `The calendar has ${calendar.months.length} months`;
  if (date.day !== undefined && date.day > month.days) return `${month.name} has ${month.days} days`;
  return null;
}

export function toOrdinal(calendar: CalendarDefinition, date: WorldDate, edge: DateEdge = 'start'): number {
  const clamped = clampDate(calendar, date);
  const yearStart = clamped.year * calendar.daysPerYear;
  if (clamped.month === undefined) {
    return edge === 'start' ? yearStart : yearStart + calendar.daysPerYear - 1;
  }
  const start = yearStart + monthStart(calendar, clamped.month);
  if (clamped.day === undefined) {
    const days = monthOf(calendar, clamped.month)?.days ?? 1;
    return edge === 'start' ? start : start + days - 1;
  }
  return start + clamped.day - 1;
}

/** The full date (to the day) of an ordinal day number. */
export function fromOrdinal(calendar: CalendarDefinition, ordinal: number): WorldDate {
  const whole = Math.floor(ordinal);
  const year = Math.floor(whole / calendar.daysPerYear);
  let dayOfYear = whole - year * calendar.daysPerYear;
  for (const month of calendar.months) {
    if (dayOfYear < month.days) return { year: year === 0 ? 0 : year, month: month.n, day: dayOfYear + 1 };
    dayOfYear -= month.days;
  }
  // Unreachable while daysPerYear is the sum of the months; keep a valid date anyway.
  return { year, month: calendar.months.length, day: 1 };
}

/** Negative when `a` begins before `b`; a coarser date sorts before a finer one starting on the same day. */
export function compareDates(calendar: CalendarDefinition, a: WorldDate, b: WorldDate): number {
  const byStart = toOrdinal(calendar, a, 'start') - toOrdinal(calendar, b, 'start');
  if (byStart !== 0) return byStart;
  return precisionRank(precisionOf(a)) - precisionRank(precisionOf(b));
}

function precisionRank(precision: DatePrecision): number {
  return precision === 'year' ? 0 : precision === 'month' ? 1 : 2;
}

const STEP_YEARS: Record<'year' | 'decade' | 'century', number> = { year: 1, decade: 10, century: 100 };

/**
 * Moves `date` by `amount` units. Stepping by day or month first makes the date
 * that precise (a bare year starts at its first month/day); stepping by years
 * keeps the precision and clamps the day to the target month.
 */
export function stepDate(calendar: CalendarDefinition, date: WorldDate, unit: StepUnit, amount: number): WorldDate {
  if (unit === 'day') {
    const precise: WorldDate = { year: date.year, month: date.month ?? 1, day: date.day ?? 1 };
    return fromOrdinal(calendar, toOrdinal(calendar, precise) + amount);
  }
  if (unit === 'month') {
    const perYear = calendar.months.length;
    const index = date.year * perYear + ((date.month ?? 1) - 1) + amount;
    const year = Math.floor(index / perYear);
    const month = index - year * perYear + 1;
    return clampDate(calendar, date.day === undefined ? { year, month } : { year, month, day: date.day });
  }
  return clampDate(calendar, { ...date, year: date.year + STEP_YEARS[unit] * amount });
}

/** Human-readable form, e.g. "12 Month 4, 1236 AA" or "1240 (Festival days)". */
export function formatDisplayDate(calendar: CalendarDefinition, date: WorldDate): string {
  const year = formatYear(calendar, date.year);
  if (date.month === undefined) return year;
  const monthName = monthOf(calendar, date.month)?.name ?? `Month ${date.month}`;
  if (date.day === undefined) return `${monthName} ${year}`;
  return `${date.day} ${monthName}, ${year}`;
}

export function formatYear(calendar: CalendarDefinition, year: number): string {
  // Stored years count straight through zero ("-3000" is 3000 years before year 0).
  if (year < 0 && calendar.eraBefore) return `${-year} ${calendar.eraBefore}`;
  return calendar.eraAfter ? `${year} ${calendar.eraAfter}` : String(year);
}
