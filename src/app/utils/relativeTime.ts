import { getLocale } from '../i18n';

/** Time units from largest to smallest, each with its length in milliseconds. */
const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

let formatter: Intl.RelativeTimeFormat | undefined;

function getFormatter(): Intl.RelativeTimeFormat {
  formatter ??= new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  return formatter;
}

/** Formats a timestamp relative to `now`, e.g. "3 days ago" or "just now" for the last minute. */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const elapsed = timestamp - now;
  const magnitude = Math.abs(elapsed);
  for (const [unit, length] of UNITS) {
    if (magnitude >= length) return getFormatter().format(Math.round(elapsed / length), unit);
  }
  return getFormatter().format(0, 'second');
}
