const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The start of the day `at` lies in, in the viewer's time zone. */
function dayStart(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whether two moments lie on one day of the viewer's calendar. */
export function sameDay(a: number, b: number): boolean {
  return dayStart(a) === dayStart(b);
}

/** A day as a short date: "9 Oct", with the year when it is not `now`'s. */
function shortDate(at: number, now: number, locale?: string): string {
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) });
}

/** How long ago `at` was: "just now", "5m ago", "3h ago", and from a day on a short date. */
export function relativeTime(at: number, now: number, locale?: string): string {
  const passed = now - at;
  if (passed < MINUTE) return 'just now';
  if (passed < HOUR) return `${Math.floor(passed / MINUTE)}m ago`;
  if (passed < DAY) return `${Math.floor(passed / HOUR)}h ago`;
  return shortDate(at, now, locale);
}

/** The day `at` lies in, for the line between two days: "Today", "Yesterday", else a short date. */
export function dayLabel(at: number, now: number, locale?: string): string {
  if (sameDay(at, now)) return 'Today';
  // Noon of the day before: a day with a clock change is not 24 hours long.
  if (sameDay(at, dayStart(now) - DAY / 2)) return 'Yesterday';
  return shortDate(at, now, locale);
}
