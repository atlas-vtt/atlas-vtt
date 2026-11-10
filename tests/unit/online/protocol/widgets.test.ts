import { describe, expect, it } from 'vitest';
import { nextTimerStep, parseGmMessage, timerSecondsAt, TIMER_LAG_MS } from '../../../../src/app/online/protocol/index.ts';

const bar = (widgets: unknown[], scale: unknown = 1): unknown => ({ t: 'widgets', scene: 's', bar: { scale, widgets } });
const counter = { kind: 'counter', label: 'Torches', icon: 'heart', colour: '#ffc107', value: 3 };

describe('widgets messages', () => {
  it('read counters, clocks, standing and running timers, and none', () => {
    const clock = { kind: 'clock', label: 'Doom', icon: 'skull', colour: null, value: 2, segments: 6, showCount: false };
    const running = { kind: 'timer', label: 'Torch', icon: 'flame', colour: null, value: 59.25, since: 1200 };
    expect(parseGmMessage(bar([counter, clock, running]))).toEqual({ t: 'widgets', scene: 's', bar: { scale: 1, widgets: [counter, clock, running] } });
    expect(parseGmMessage({ t: 'widgets', scene: 's', bar: null })).toEqual({ t: 'widgets', scene: 's', bar: null });
  });

  it('refuse anything a bar could not draw', () => {
    for (const widget of [
      { ...counter, kind: 'note' }, { ...counter, icon: '<svg>' }, { ...counter, colour: 'red' }, { ...counter, value: Number.NaN }, { ...counter, label: 'x'.repeat(201) },
      { ...counter, kind: 'clock', segments: 13, showCount: true }, { ...counter, kind: 'clock', segments: 4 },
      { ...counter, kind: 'timer', since: -1 }, { ...counter, kind: 'timer', value: -1, since: 0 },
    ]) expect(parseGmMessage(bar([widget])), JSON.stringify(widget)).toBeNull();
    expect(parseGmMessage(bar([counter], 0))).toBeNull();
    expect(parseGmMessage(bar(Array.from({ length: 51 }, () => counter)))).toBeNull();
  });

  it('count a running timer down as Atlas shows it, its lag behind, never below 0', () => {
    const at = (left: number): number => left - TIMER_LAG_MS;
    expect([3000, 2001, 2000, 1500, 1, 0, -5].map((left) => timerSecondsAt(3, at(left)))).toEqual([3, 3, 2, 2, 1, 0, 0]);
    // Its lag never shows more than the timer had when it started.
    expect(timerSecondsAt(3, 3000)).toBe(3);
    expect(nextTimerStep(3, 3000)).toBe(TIMER_LAG_MS + 1000);
    expect(nextTimerStep(3, at(2600))).toBe(600);
    expect(nextTimerStep(3, at(800))).toBe(800);
    expect(nextTimerStep(3, at(0))).toBeNull();
  });
});
