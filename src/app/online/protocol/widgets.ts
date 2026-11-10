import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_NAME } from './tokens.ts';

/** Widgets one `widgets` message may carry. */
export const MAX_WIDGETS = 50;
export const WIDGET_KINDS = ['counter', 'clock', 'timer'] as const;
export type SharedWidgetKind = (typeof WIDGET_KINDS)[number];
/** A widget's icon: the key Atlas names it by. */
const ICON_PATTERN = /^[a-z0-9-]{1,40}$/;
/** A clock's segments, as Atlas allows them. */
const MIN_SEGMENTS = 2;
const MAX_SEGMENTS = 12;
const MAX_VALUE = 1e9;

/** A widget on the players' bar, as Atlas's player window draws it. */
export interface SharedWidget {
  readonly kind: SharedWidgetKind;
  readonly label: string;
  readonly icon: string;
  /** `#rrggbb`; null takes the kind's default colour. */
  readonly colour: string | null;
  /** A counter's number, a clock's filled segments, a timer's seconds left (at `since` for a running one, to the millisecond). */
  readonly value: number;
  /** A clock's segments and whether it shows its count. */
  readonly segments?: number;
  readonly showCount?: boolean;
  /** A running timer: milliseconds from the moment it had `value` seconds left to the message's sending; absent while it stands. */
  readonly since?: number;
}

/** The players' widget bar: its widgets in order and the bar's scale. */
export interface SharedWidgetBar {
  readonly scale: number;
  readonly widgets: readonly SharedWidget[];
}

const isNumber = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

function parseWidget(value: unknown): SharedWidget | null {
  if (!isRecord(value) || !WIDGET_KINDS.includes(value.kind as SharedWidgetKind) || !isNumber(value.value, MAX_VALUE)) return null;
  const { label, icon, colour } = value;
  if (typeof label !== 'string' || label.length > MAX_NAME || typeof icon !== 'string' || !ICON_PATTERN.test(icon)) return null;
  if (colour !== null && (typeof colour !== 'string' || !COLOUR_PATTERN.test(colour))) return null;
  const base = { kind: value.kind as SharedWidgetKind, label, icon, colour, value: value.value };
  if (value.kind === 'clock') {
    const { segments, showCount } = value;
    if (!Number.isInteger(segments) || (segments as number) < MIN_SEGMENTS || (segments as number) > MAX_SEGMENTS || typeof showCount !== 'boolean') return null;
    return { ...base, segments: segments as number, showCount };
  }
  if (value.kind === 'timer' && value.since !== undefined) {
    return isNumber(value.since, MAX_VALUE) && value.since >= 0 && value.value >= 0 ? { ...base, since: value.since } : null;
  }
  return base;
}

/** The bar of a `widgets` message: null for none shown, undefined for anything malformed. */
export function parseWidgetBar(value: unknown): SharedWidgetBar | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isNumber(value.scale, 4) || value.scale < 0.25 || !Array.isArray(value.widgets) || value.widgets.length > MAX_WIDGETS) return undefined;
  const widgets: SharedWidget[] = [];
  for (const entry of value.widgets) {
    const widget = parseWidget(entry);
    if (widget === null) return undefined;
    widgets.push(widget);
  }
  return { scale: value.scale, widgets };
}

/**
 * How far the players' timers run behind the GM's. It is longer than a frame's delivery and the pace
 * of sends, so a pause reaches the page before its timer would show a second the GM's never did.
 */
export const TIMER_LAG_MS = 250;

/**
 * The whole seconds a running timer that had `value` seconds left shows with `left` milliseconds to go
 * on the GM's, as Atlas shows them (a started 5-minute timer shows 5:00 until its first second has
 * passed), `TIMER_LAG_MS` behind but never above `value`, and never below 0.
 */
export function timerSecondsAt(value: number, left: number): number {
  return Math.max(0, Math.ceil(Math.round(Math.min(value * 1000, left + TIMER_LAG_MS)) / 1000));
}

/** Milliseconds until such a timer shows its next second, or null once it shows 0. */
export function nextTimerStep(value: number, left: number): number | null {
  const shown = timerSecondsAt(value, left);
  return shown <= 0 ? null : Math.max(1, Math.round(left + TIMER_LAG_MS) - (shown - 1) * 1000);
}
