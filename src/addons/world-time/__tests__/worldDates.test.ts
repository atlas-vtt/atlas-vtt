import { describe, expect, it } from 'vitest';
import { fallbackCalendar, readCalendarFile, pickCalendar } from '../calendar/calendarDefinition';
import { compareDates, dateProblem, formatDisplayDate, fromOrdinal, stepDate, toOrdinal } from '../calendar/dateMath';
import { formatWorldDate, normalizeWorldDate, parseWorldDate } from '../calendar/worldDate';

const calendar = fallbackCalendar();

describe('parseWorldDate', () => {
  it('reads years, months and days, including negative years and month 13', () => {
    expect(parseWorldDate('1236')).toEqual({ year: 1236 });
    expect(parseWorldDate('-3000')).toEqual({ year: -3000 });
    expect(parseWorldDate('1236-04')).toEqual({ year: 1236, month: 4 });
    expect(parseWorldDate('1240-13-02')).toEqual({ year: 1240, month: 13, day: 2 });
    expect(parseWorldDate('-12-01-30')).toEqual({ year: -12, month: 1, day: 30 });
    expect(parseWorldDate(' 0 ')).toEqual({ year: 0 });
  });

  it('accepts unquoted YAML values', () => {
    expect(parseWorldDate(1236)).toEqual({ year: 1236 });
    expect(parseWorldDate(new Date(Date.UTC(1236, 3, 12)))).toEqual({ year: 1236, month: 4, day: 12 });
  });

  it('rejects anything else', () => {
    for (const value of ['', 'TODO', '1236-00', '1236-04-00', '12.5', 1.5, null, undefined, {}, '1236/04/12']) {
      expect(parseWorldDate(value)).toBeNull();
    }
  });

  it('normalises to the storage form', () => {
    expect(normalizeWorldDate('1236-4-2')).toBe('1236-04-02');
    expect(normalizeWorldDate('+1236')).toBe('1236');
    expect(formatWorldDate({ year: -5, month: 13 })).toBe('-5-13');
    expect(normalizeWorldDate('-0')).toBe('0');
  });
});

describe('calendar arithmetic', () => {
  it('has the Arcivalian year of 12 × 30 days and 5 festival days', () => {
    expect(calendar.daysPerYear).toBe(365);
    expect(calendar.months[12]).toMatchObject({ n: 13, days: 5, intercalary: true });
  });

  it('round-trips day numbers across year 0 and negative years', () => {
    for (const date of [{ year: -3000, month: 1, day: 1 }, { year: -1, month: 13, day: 5 }, { year: 0, month: 1, day: 1 }, { year: 1240, month: 13, day: 2 }]) {
      expect(fromOrdinal(calendar, toOrdinal(calendar, date))).toEqual(date);
    }
    expect(toOrdinal(calendar, { year: 0 }) - toOrdinal(calendar, { year: -1, month: 13, day: 5 })).toBe(1);
  });

  it('gives a year or month its first or last day', () => {
    expect(toOrdinal(calendar, { year: 1 }, 'end')).toBe(365 + 364);
    expect(toOrdinal(calendar, { year: 1, month: 13 }, 'end') - toOrdinal(calendar, { year: 1, month: 13 }, 'start')).toBe(4);
  });

  it('orders dates, coarser first on the same day', () => {
    const sorted = ['1236-04-12', '-3000', '1236', '1236-04', '1235-13-05'].map((text) => parseWorldDate(text)!)
      .sort((a, b) => compareDates(calendar, a, b))
      .map(formatWorldDate);
    expect(sorted).toEqual(['-3000', '1235-13-05', '1236', '1236-04', '1236-04-12']);
  });

  it('steps by every unit', () => {
    expect(stepDate(calendar, { year: 1236, month: 12, day: 30 }, 'day', 1)).toEqual({ year: 1236, month: 13, day: 1 });
    expect(stepDate(calendar, { year: 1236, month: 13, day: 5 }, 'day', 1)).toEqual({ year: 1237, month: 1, day: 1 });
    expect(stepDate(calendar, { year: 1236, month: 1 }, 'month', -1)).toEqual({ year: 1235, month: 13 });
    expect(stepDate(calendar, { year: 1236, month: 12, day: 30 }, 'month', 1)).toEqual({ year: 1236, month: 13, day: 5 });
    expect(stepDate(calendar, { year: 5 }, 'decade', -1)).toEqual({ year: -5 });
    expect(stepDate(calendar, { year: 1236 }, 'century', 2)).toEqual({ year: 1436 });
    expect(stepDate(calendar, { year: 1236 }, 'day', 1)).toEqual({ year: 1236, month: 1, day: 2 });
  });

  it('explains dates the calendar does not have', () => {
    expect(dateProblem(calendar, { year: 1, month: 13, day: 6 })).toMatch(/5 days/);
    expect(dateProblem(calendar, { year: 1, month: 14 })).toMatch(/13 months/);
    expect(dateProblem(calendar, { year: 1, month: 13, day: 5 })).toBeNull();
  });
});

describe('calendar file', () => {
  const file = {
    default: 'arcivalian',
    calendars: [
      {
        id: 'arcivalian',
        name: 'Arcivalian reckoning',
        era_names: { after: 'AA', before: 'TODO' },
        months: [
          { n: 1, name: 'Frostmoon', days: 30 }, { n: 2, name: 'TODO', days: 30 },
          ...Array.from({ length: 10 }, (_, i) => ({ n: i + 3, name: `M${i + 3}`, days: 30 })),
          { n: 13, name: 'TODO (the five festival days)', days: 5, intercalary: true },
        ],
        holy_days: [{ month: 0, day: 0, name: 'TODO' }, { month: 13, day: 1, name: 'Odo\'s birth' }],
      },
      { id: 'elven', name: 'Elven calendar', months: [] },
    ],
  };

  it('reads months, skips placeholders and labels years', () => {
    const arcivalian = pickCalendar(readCalendarFile(file));
    expect(arcivalian.daysPerYear).toBe(365);
    expect(arcivalian.months[0]?.name).toBe('Frostmoon');
    expect(arcivalian.months[1]?.name).toBe('Month 2');
    expect(arcivalian.months[12]?.name).toBe('Festival days');
    expect(arcivalian.holyDays).toEqual([{ month: 13, day: 1, name: 'Odo\'s birth' }]);
    expect(formatDisplayDate(arcivalian, { year: 1236, month: 1, day: 3 })).toBe('3 Frostmoon, 1236 AA');
    expect(formatDisplayDate(arcivalian, { year: -50 })).toBe('-50 AA');
  });

  it('lets a calendar without months stand on the Arcivalian structure', () => {
    const elven = pickCalendar(readCalendarFile(file), 'elven');
    expect(elven.hasOwnMonths).toBe(false);
    expect(elven.daysPerYear).toBe(365);
  });

  it('falls back to the built-in calendar for an unreadable file', () => {
    expect(readCalendarFile('nonsense').calendars).toEqual([fallbackCalendar()]);
    expect(pickCalendar(readCalendarFile(null), 'missing').id).toBe('arcivalian');
  });
});
