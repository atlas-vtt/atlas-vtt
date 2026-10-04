import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { fallbackCalendar } from '../calendar/calendarDefinition';
import { fromOrdinal, toOrdinal } from '../calendar/dateMath';
import { dateExtent } from '../dating/dateExtent';
import { dateAtDay, sliderPrecision } from '../dating/sliderDate';
import { latestDay, sliderRange } from '../sceneDateRange';
import { readWorldSettings, DEFAULT_WORLD_SETTINGS } from '../worldSettings';
import { createInitialWorldTimeState, createWorldTimeActions } from '../store/worldTimeSlice';
import type { NotePin } from 'src/app/types';

const calendar = fallbackCalendar();
const day = (year: number, edge: 'start' | 'end' = 'start'): number => toOrdinal(calendar, { year }, edge);

describe('slider range', () => {
  const bounds = [{ from: '1200', to: '1236' }, { from: '-50' }, {}, { to: '1300-02' }];

  it('spans the dated things of the scene, ignoring open ends', () => {
    expect(dateExtent(calendar, bounds)).toEqual({ start: day(-50), end: toOrdinal(calendar, { year: 1300, month: 2 }, 'end') });
    expect(latestDay(calendar, bounds)).toBe(toOrdinal(calendar, { year: 1300, month: 2 }, 'end'));
    expect(dateExtent(calendar, [{}])).toBeNull();
  });

  it('prefers the GM bounds and falls back to a span around the viewing date', () => {
    expect(sliderRange(calendar, { rangeStart: '1000', rangeEnd: '1100' }, bounds, null)).toEqual({ start: day(1000), end: day(1100, 'end') });
    const auto = sliderRange(calendar, {}, bounds, null)!;
    expect(auto.start).toBeLessThan(day(-50));
    expect(auto.end).toBeGreaterThan(day(1300));
    expect(sliderRange(calendar, {}, [], '500')).toEqual({ start: day(400), end: day(600, 'end') });
    expect(sliderRange(calendar, {}, [], null)).toBeNull();
  });

  it('picks coarser dates on long ranges', () => {
    expect(sliderPrecision({ start: day(0), end: day(1000) }, 365)).toBe('year');
    expect(sliderPrecision({ start: day(0), end: day(50) }, 365)).toBe('month');
    expect(sliderPrecision({ start: day(0), end: day(1) }, 365)).toBe('day');
    expect(dateAtDay(calendar, toOrdinal(calendar, { year: -3, month: 13, day: 4 }), 'month')).toEqual({ year: -3, month: 13 });
    expect(fromOrdinal(calendar, day(-3))).toEqual({ year: -3, month: 1, day: 1 });
  });
});

describe('world settings', () => {
  it('reads stored settings and repairs broken fields', () => {
    expect(readWorldSettings(undefined)).toEqual(DEFAULT_WORLD_SETTINGS);
    expect(readWorldSettings({ calendarPath: '  ', defaultViewingDate: '1236-4', rumourYears: -1, showGhosted: true, dateBar: 'dated-scenes' }))
      .toMatchObject({ calendarPath: DEFAULT_WORLD_SETTINGS.calendarPath, defaultViewingDate: '1236-04', rumourYears: 1, showGhosted: true, dateBar: 'dated-scenes' });
  });
});

describe('world time store actions', () => {
  type Draft = ReturnType<typeof createInitialWorldTimeState> & { objects: { pins: Record<string, NotePin>; tokens: Record<string, never>; texts: Record<string, never>; drawings: Record<string, never> } };
  function harness(): { state: () => Draft; actions: ReturnType<typeof createWorldTimeActions> } {
    let state: Draft = { ...createInitialWorldTimeState(), objects: { pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: '' } as NotePin }, tokens: {}, texts: {}, drawings: {} } };
    const actions = createWorldTimeActions((fn) => { state = produce(state, fn); });
    return { state: () => state, actions };
  }

  it('stores normalised viewing dates and ranges', () => {
    const { state, actions } = harness();
    actions.setViewingDate('1236-4-2');
    actions.setWorldRange('-10', 'nonsense');
    expect(state().worldTime).toEqual({ viewingDate: '1236-04-02', rangeStart: '-10' });
    actions.setViewingDate(null);
    expect(state().worldTime.viewingDate).toBeUndefined();
  });

  it('sets, clears and stops inheriting object dates', () => {
    const { state, actions } = harness();
    actions.setObjectDates([{ kind: 'pin', id: 'p' }, { kind: 'pin', id: 'missing' }], { from: '1200', to: '1236', inherit: false });
    expect(state().objects.pins.p).toMatchObject({ from: '1200', to: '1236', dateInherit: false });
    actions.setObjectDates([{ kind: 'pin', id: 'p' }], { to: null, inherit: true });
    expect(state().objects.pins.p).toMatchObject({ from: '1200' });
    expect(state().objects.pins.p?.to).toBeUndefined();
    expect(state().objects.pins.p?.dateInherit).toBeUndefined();
  });

  it('adds, edits and removes map variants', () => {
    const { state, actions } = harness();
    actions.addMapVariant({ id: 'v', background: 'a.png' });
    actions.updateMapVariant('v', { from: '-5', name: 'Old', background: 'b.png' });
    expect(state().worldTime.variants).toEqual([{ id: 'v', background: 'b.png', name: 'Old', from: '-5' }]);
    actions.updateMapVariant('v', { from: undefined });
    expect(state().worldTime.variants?.[0]?.from).toBeUndefined();
    actions.removeMapVariant('v');
    expect(state().worldTime.variants).toBeUndefined();
  });
});
