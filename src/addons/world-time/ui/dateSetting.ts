import type { Setting } from 'obsidian';
import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { dateProblem, formatDisplayDate } from '../calendar/dateMath';
import { formatWorldDate, parseWorldDate } from '../calendar/worldDate';

/** Why `text` is not a usable date, or null for a valid or empty one. */
export function dateInputProblem(calendar: CalendarDefinition, text: string): string | null {
  if (text.trim() === '') return null;
  const date = parseWorldDate(text);
  if (!date) return 'Use YYYY, YYYY-MM or YYYY-MM-DD (years may be negative)';
  return dateProblem(calendar, date);
}

/**
 * A text field for a world date on a settings row. The row's description
 * shows how the date reads in the calendar, or why it is not valid;
 * `onChange` receives the storage form, or null for an empty field, and is
 * not called while the text is invalid.
 */
export function addDateField(
  setting: Setting,
  calendar: CalendarDefinition,
  value: string | undefined,
  onChange: (date: string | null) => void,
  placeholder = 'YYYY-MM-DD',
): void {
  const baseDesc = setting.descEl.textContent ?? '';
  const describe = (text: string): void => {
    const problem = dateInputProblem(calendar, text);
    const date = parseWorldDate(text);
    const reading = problem ?? (date ? formatDisplayDate(calendar, date) : '');
    setting.setDesc(reading ? (baseDesc ? `${baseDesc} — ${reading}` : reading) : baseDesc);
    setting.settingEl.toggleClass('atlas-world-date-invalid', problem !== null);
  };
  setting.addText((text) => {
    text.setPlaceholder(placeholder).setValue(value ?? '');
    text.onChange((next) => {
      describe(next);
      if (dateInputProblem(calendar, next) !== null) return;
      const date = parseWorldDate(next);
      onChange(date ? formatWorldDate(date) : null);
    });
  });
  describe(value ?? '');
}
