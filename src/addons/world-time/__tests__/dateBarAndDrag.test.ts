import { describe, expect, it, vi } from 'vitest';
import type { NotePin } from 'src/app/types';
import { fallbackCalendar } from '../calendar/calendarDefinition';
import { viewingSpan } from '../dating/dateRange';
import { computeTimeMask } from '../dating/timeMask';
import { DEFAULT_WORLD_SETTINGS, readWorldSettings } from '../worldSettings';

const calendar = fallbackCalendar();
const pin = (id: string, extra: Partial<NotePin> = {}): NotePin => ({ id, kind: 'pin', x: 0, y: 0, notePath: `${id}.md`, ...extra });

describe('date bar settings', () => {
  it('shows the bar at the bottom by default', () => {
    expect(DEFAULT_WORLD_SETTINGS.showDateBar).toBe(true);
    expect(DEFAULT_WORLD_SETTINGS.dateBarPosition).toBe('bottom');
    expect(readWorldSettings({}).dateBarPosition).toBe('bottom');
  });

  it('keeps a chosen edge and switch, and ignores anything else', () => {
    expect(readWorldSettings({ dateBarPosition: 'left', showDateBar: false })).toMatchObject({ dateBarPosition: 'left', showDateBar: false });
    expect(readWorldSettings({ dateBarPosition: 'middle', showDateBar: 'no' })).toMatchObject({ dateBarPosition: 'bottom', showDateBar: true });
  });
});

describe('time mask while a pin is dragged', () => {
  it('works out only objects it has not seen before', () => {
    const memo = new WeakMap<object, 'visible' | 'ghost' | 'hidden'>();
    const noteDates = vi.fn(() => ({ from: '1300' }));
    const still = pin('still');
    const viewing = viewingSpan(calendar, '1238');
    const first = computeTimeMask({ calendar, objects: { pins: { still, moved: pin('moved') }, tokens: {}, texts: {}, drawings: {} }, viewing, showGhosted: false, noteDates, memo });
    expect(noteDates).toHaveBeenCalledTimes(2);

    // A drag step: the moved pin is a new object, the other one is the same
    const second = computeTimeMask({ calendar, objects: { pins: { still, moved: pin('moved', { x: 5 }) }, tokens: {}, texts: {}, drawings: {} }, viewing, showGhosted: false, noteDates, memo });
    expect(noteDates).toHaveBeenCalledTimes(3);
    expect(second).toEqual(first);
    expect(second.hidden).toEqual({ still: true, moved: true });
  });
});

describe('year labels', () => {
  it('replace the calendar file\'s labels, and an empty choice keeps them', async () => {
    const { withYearLabels } = await import('../calendar/calendarDefinition');
    const { formatYear } = await import('../calendar/dateMath');
    const file = { ...calendar, eraAfter: 'eO', eraBefore: 'fO' };
    expect(formatYear(withYearLabels(file, { yearLabel: 'AD', yearLabelBefore: 'BC' }), 1236)).toBe('1236 AD');
    expect(formatYear(withYearLabels(file, { yearLabel: 'AD', yearLabelBefore: 'BC' }), -40)).toBe('40 BC');
    expect(withYearLabels(file, { yearLabel: ' ', yearLabelBefore: '' })).toBe(file);
    expect(readWorldSettings({ yearLabel: ' DoD ' }).yearLabel).toBe('DoD');
  });
});
