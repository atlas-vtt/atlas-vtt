import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { fromOrdinal } from '../calendar/dateMath';
import { truncateDate, type DatePrecision, type WorldDate } from '../calendar/worldDate';
import type { DaySpan } from './dateRange';

/** Above this many years the slider moves in whole years, above the lower bound in months. */
const YEAR_STEPS_ABOVE_YEARS = 200;
const MONTH_STEPS_ABOVE_YEARS = 3;

/** How precise a date picked on a slider over `range` is, so a long range does not yield odd days. */
export function sliderPrecision(range: DaySpan, daysPerYear: number): DatePrecision {
  const years = (range.end - range.start) / daysPerYear;
  if (years > YEAR_STEPS_ABOVE_YEARS) return 'year';
  return years > MONTH_STEPS_ABOVE_YEARS ? 'month' : 'day';
}

/** The date of a slider position (a day number), cut to `precision`. */
export function dateAtDay(calendar: CalendarDefinition, day: number, precision: DatePrecision): WorldDate {
  return truncateDate(fromOrdinal(calendar, Math.round(day)), precision);
}
