import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { spanOf, type DateBounds, type DaySpan } from './dateRange';

/**
 * The days the slider of a scene covers when the GM fixed no bounds: from the
 * earliest to the latest date any of the scene's dated things names. Open
 * ends (an empty `from` or `to`) add nothing. Null when nothing is dated.
 */
export function dateExtent(calendar: CalendarDefinition, bounds: Iterable<DateBounds>): DaySpan | null {
  let start = Infinity;
  let end = -Infinity;
  for (const entry of bounds) {
    const span = spanOf(calendar, entry);
    if (!span) continue;
    for (const day of [span.start, span.end]) {
      if (!Number.isFinite(day)) continue;
      start = Math.min(start, day);
      end = Math.max(end, day);
    }
  }
  return start <= end ? { start, end } : null;
}

/** Days added around an automatic range so its ends are not on the slider's edge. */
export function paddedExtent(extent: DaySpan, daysPerYear: number): DaySpan {
  const pad = Math.max(daysPerYear, Math.round((extent.end - extent.start) * 0.05));
  return { start: extent.start - pad, end: extent.end + pad };
}
