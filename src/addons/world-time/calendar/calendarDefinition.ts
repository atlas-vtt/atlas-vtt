import { isRecord } from 'src/app/services/assetMetadataGuards';

/**
 * Calendars as the calendar file (`atlas-vtt/world/calendar.json` by default)
 * defines them; see the add-on's README for the format. Unfilled entries
 * ("TODO …" names, empty month lists) are tolerated: a calendar without months
 * takes the Arcivalian structure, a placeholder name becomes "Month N".
 */
export interface CalendarMonth {
  /** 1-based position in the year. */
  n: number;
  name: string;
  days: number;
  /** Days outside the regular months, such as the five festival days. */
  intercalary: boolean;
}

export interface HolyDay {
  month: number;
  day: number;
  name: string;
  note?: string;
}

export interface CalendarDefinition {
  id: string;
  name: string;
  months: CalendarMonth[];
  weekdays: string[];
  holyDays: HolyDay[];
  /** Label after a positive year, e.g. "AA"; empty when the file names none. */
  eraAfter: string;
  /** Label after a negative year (shown as a positive number); empty when the file names none. */
  eraBefore: string;
  /** Sum of all month lengths. */
  daysPerYear: number;
  /** False when the file gave no months and the Arcivalian structure stands in. */
  hasOwnMonths: boolean;
}

export interface CalendarFile {
  defaultId: string;
  calendars: CalendarDefinition[];
}

export const ARCIVALIAN_ID = 'arcivalian';

/** 12 × 30 days and 5 festival days, the Arcivalian year of Drakar och Demoner's Altor. */
function arcivalianMonths(): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  for (let n = 1; n <= 12; n++) months.push({ n, name: `Month ${n}`, days: 30, intercalary: false });
  months.push({ n: 13, name: 'Festival days', days: 5, intercalary: true });
  return months;
}

export function fallbackCalendar(): CalendarDefinition {
  const months = arcivalianMonths();
  return {
    id: ARCIVALIAN_ID,
    name: 'Arcivalian reckoning',
    months,
    weekdays: [],
    holyDays: [],
    eraAfter: '',
    eraBefore: '',
    daysPerYear: totalDays(months),
    hasOwnMonths: true,
  };
}

function totalDays(months: CalendarMonth[]): number {
  return months.reduce((sum, month) => sum + month.days, 0);
}

/** True for text the calendar file leaves to be filled in later. */
function isPlaceholder(text: string): boolean {
  return text.trim() === '' || /^todo\b/i.test(text.trim());
}

function readText(value: unknown): string {
  return typeof value === 'string' && !isPlaceholder(value) ? value.trim() : '';
}

function readMonths(value: unknown): CalendarMonth[] {
  if (!Array.isArray(value)) return [];
  const months: CalendarMonth[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const n = typeof entry.n === 'number' && Number.isInteger(entry.n) && entry.n > 0 ? entry.n : index + 1;
    const days = typeof entry.days === 'number' && Number.isInteger(entry.days) && entry.days > 0 ? entry.days : 0;
    if (days === 0) return;
    const intercalary = entry.intercalary === true;
    const name = readText(entry.name) || (intercalary ? 'Festival days' : `Month ${n}`);
    months.push({ n, name, days, intercalary });
  });
  months.sort((a, b) => a.n - b.n);
  // Positions must run 1..N without gaps, since dates address months by number.
  return months.map((month, index) => ({ ...month, n: index + 1 }));
}

function readHolyDays(value: unknown): HolyDay[] {
  if (!Array.isArray(value)) return [];
  const days: HolyDay[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = readText(entry.name);
    if (!name || typeof entry.month !== 'number' || typeof entry.day !== 'number') continue;
    if (entry.month < 1 || entry.day < 1) continue;
    const note = readText(entry.note);
    days.push({ month: entry.month, day: entry.day, name, ...(note ? { note } : {}) });
  }
  return days;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter((text) => text !== '') : [];
}

export function readCalendar(value: unknown): CalendarDefinition | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') return null;
  const ownMonths = readMonths(value.months);
  const months = ownMonths.length > 0 ? ownMonths : arcivalianMonths();
  const eraNames = isRecord(value.era_names) ? value.era_names : {};
  return {
    id: value.id.trim(),
    name: readText(value.name) || value.id.trim(),
    months,
    weekdays: readStringList(value.weekdays),
    holyDays: readHolyDays(value.holy_days),
    eraAfter: readText(eraNames.after),
    eraBefore: readText(eraNames.before),
    daysPerYear: totalDays(months),
    hasOwnMonths: ownMonths.length > 0,
  };
}

/** Reads a parsed calendar file; anything unreadable yields the built-in Arcivalian calendar. */
export function readCalendarFile(value: unknown): CalendarFile {
  const calendars: CalendarDefinition[] = [];
  if (isRecord(value) && Array.isArray(value.calendars)) {
    for (const entry of value.calendars) {
      const calendar = readCalendar(entry);
      if (calendar && !calendars.some((known) => known.id === calendar.id)) calendars.push(calendar);
    }
  }
  if (calendars.length === 0) calendars.push(fallbackCalendar());
  const named = isRecord(value) && typeof value.default === 'string' ? value.default : '';
  const defaultId = calendars.some((calendar) => calendar.id === named) ? named : calendars[0]?.id ?? ARCIVALIAN_ID;
  return { defaultId, calendars };
}

/** The calendar `id` names, else the file's default, else the built-in one. */
export function pickCalendar(file: CalendarFile, id?: string): CalendarDefinition {
  return file.calendars.find((calendar) => calendar.id === id)
    ?? file.calendars.find((calendar) => calendar.id === file.defaultId)
    ?? fallbackCalendar();
}

/** The calendar with the year labels the user chose in place of its own; an empty choice keeps the file's. */
export function withYearLabels(calendar: CalendarDefinition, labels: { yearLabel: string; yearLabelBefore: string }): CalendarDefinition {
  const eraAfter = labels.yearLabel.trim() || calendar.eraAfter;
  const eraBefore = labels.yearLabelBefore.trim() || calendar.eraBefore;
  return eraAfter === calendar.eraAfter && eraBefore === calendar.eraBefore ? calendar : { ...calendar, eraAfter, eraBefore };
}

export function monthOf(calendar: CalendarDefinition, month: number): CalendarMonth | undefined {
  return calendar.months[month - 1];
}
