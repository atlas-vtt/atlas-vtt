import type { AnyWidget, TimerRun, TimerWidget, WidgetSettings } from '../types/widgetTypes';

export const DEFAULT_TIMER_COLOR = '#4caf50';

/** What a timer stores about its time: the seconds left, and while it runs since when. */
export type TimerState = Pick<TimerWidget, 'value' | 'running'>;

/** Seconds left at a checkpoint keep millisecond precision, so pausing often loses no time. */
function toMilliseconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/**
 * The timer's run, if it runs. A run whose `remaining` differs from `value` was
 * left behind by an older Atlas, which ticks `value` down by itself and knows no
 * run, so the timer is read as paused at `value`.
 */
export function timerRun(widget: TimerWidget): TimerRun | undefined {
  const run = widget.running;
  return run && run.remaining === widget.value && Number.isFinite(run.since) ? run : undefined;
}

/** Seconds left at `now` (epoch ms), counted from the wall clock while the timer runs. */
export function timerRemaining(widget: TimerWidget, now: number): number {
  const run = timerRun(widget);
  const left = run ? run.remaining - Math.max(0, now - run.since) / 1000 : widget.value ?? 0;
  return Math.max(0, left);
}

/** The whole seconds a timer shows: a started 5-minute timer shows 05:00 until its first second has passed. */
export function timerShownSeconds(widget: TimerWidget, now: number): number {
  return Math.ceil(toMilliseconds(timerRemaining(widget, now)));
}

/** Milliseconds until the shown seconds next change, or until the timer runs out. */
export function msUntilNextSecond(widget: TimerWidget, now: number): number {
  const left = timerRemaining(widget, now) * 1000;
  return Math.max(1, Math.round(left - (Math.ceil(left / 1000) - 1) * 1000));
}

/** When a run ends (epoch ms); checkpoints of one countdown keep it within a millisecond. */
export function timerDeadline(run: TimerRun): number {
  return run.since + run.remaining * 1000;
}

export function isTimerExpired(widget: TimerWidget, now: number): boolean {
  return timerRun(widget) !== undefined && timerRemaining(widget, now) <= 0;
}

/** Starts the timer at `now`; one that has run out starts again from its full duration. */
export function startedTimer(widget: TimerWidget, now: number): TimerState {
  const value = widget.value > 0 ? widget.value : widget.duration;
  return { value, running: { since: now, remaining: value } };
}

/**
 * The timer as it stands at `now`: paused with the seconds it has left, or, with
 * `keepRunning`, running on from here. Older Atlas versions read `value` alone.
 */
export function timerAt(widget: TimerWidget, now: number, keepRunning = false): TimerState {
  const value = toMilliseconds(timerRemaining(widget, now));
  return keepRunning && value > 0 ? { value, running: { since: now, remaining: value } } : { value };
}

/**
 * The widgets with every running timer paused: at the time it has left at `at`,
 * or without `at` at the time it last wrote. A timer runs only while a view shows
 * it, so a run read from a file (cut short by a quit or crash) is never resumed.
 * Returns `widgets` when no timer runs.
 */
export function pausedTimers(widgets: WidgetSettings['widgets'], at?: number): WidgetSettings['widgets'] {
  let paused: WidgetSettings['widgets'] | undefined;
  // Read from files too, where an entry may be anything
  const entries: [string, AnyWidget | null][] = Object.entries(widgets);
  for (const [id, widget] of entries) {
    if (widget?.type !== 'timer' || widget.running === undefined) continue;
    paused ??= { ...widgets };
    const timer = { ...widget, value: at === undefined ? widget.value : timerAt(widget, at).value };
    delete timer.running;
    paused[id] = timer;
  }
  return paused ?? widgets;
}

export function resetTimer(widget: TimerWidget): TimerState {
  return { value: widget.duration };
}

/** Formats seconds as MM:SS, or H:MM:SS from an hour up. */
export function formatTimerTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
