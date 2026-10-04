/**
 * World dates as the living-world notes store them: `"YYYY"`, `"YYYY-MM"` or
 * `"YYYY-MM-DD"`, years may be negative and month 13 holds the intercalary
 * (festival) days. All stored dates use the default calendar of the vault's
 * calendar file (Arcivalian years for Altor).
 */
export interface WorldDate {
  year: number;
  /** 1-based; absent for a date known only to the year. */
  month?: number;
  /** 1-based; only set together with `month`. */
  day?: number;
}

export type DatePrecision = 'year' | 'month' | 'day';

const DATE_PATTERN = /^([+-]?\d{1,7})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;

/**
 * Reads a date from a frontmatter or user value. Accepts strings in the
 * formats above, whole numbers (a YAML year written without quotes) and
 * `Date` objects (an unquoted ISO date some YAML parsers turn into one).
 * Returns null for anything else, including empty strings.
 */
export function parseWorldDate(input: unknown): WorldDate | null {
  if (typeof input === 'number') {
    return Number.isInteger(input) ? { year: normalizeZero(input) } : null;
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return { year: input.getUTCFullYear(), month: input.getUTCMonth() + 1, day: input.getUTCDate() };
  }
  if (typeof input !== 'string') return null;
  const match = DATE_PATTERN.exec(input.trim());
  if (!match) return null;
  const year = normalizeZero(Number.parseInt(match[1] ?? '', 10));
  if (!Number.isFinite(year)) return null;
  if (match[2] === undefined) return { year };
  const month = Number.parseInt(match[2], 10);
  if (month < 1) return null;
  if (match[3] === undefined) return { year, month };
  const day = Number.parseInt(match[3], 10);
  if (day < 1) return null;
  return { year, month, day };
}

/** `-0` would print as "0" but compare oddly in tests; keep a single zero. */
function normalizeZero(year: number): number {
  return year === 0 ? 0 : year;
}

export function precisionOf(date: WorldDate): DatePrecision {
  if (date.month === undefined) return 'year';
  return date.day === undefined ? 'month' : 'day';
}

/** The storage form: `"1236"`, `"-3000"`, `"1236-04"`, `"1240-13-02"`. */
export function formatWorldDate(date: WorldDate): string {
  let text = String(date.year);
  if (date.month === undefined) return text;
  text += `-${pad2(date.month)}`;
  if (date.day === undefined) return text;
  return `${text}-${pad2(date.day)}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Normalises a user or frontmatter value to the storage form; null when it is not a date. */
export function normalizeWorldDate(input: unknown): string | null {
  const date = parseWorldDate(input);
  return date ? formatWorldDate(date) : null;
}

/** Cuts a date down to `precision` (a finer date than asked keeps only its leading parts). */
export function truncateDate(date: WorldDate, precision: DatePrecision): WorldDate {
  if (precision === 'year') return { year: date.year };
  if (precision === 'month') return date.month === undefined ? { year: date.year } : { year: date.year, month: date.month };
  return { ...date };
}
