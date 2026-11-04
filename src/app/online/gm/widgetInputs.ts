import { MAX_NAME, MAX_WIDGETS, type SharedWidget } from '../protocol/index.ts';
import { resolveWidgetIcon } from '../../types/widgetIcons';
import type { AnyWidget, TimerRun, TimerWidget, WidgetSettings } from '../../types/widgetTypes';
import { timerRun } from '../../utils/timerWidget';
import { isValidClockSegments } from '../../utils/clockWidget';
import { isWidgetOn } from '../../utils/widgetActivation';
import { hexColour } from './scenePicture.ts';

/** What the players' widget bar is made of: the scene's widget settings and the stepped widgets' values. */
export interface WidgetInputs {
  readonly widgetSettings?: WidgetSettings | undefined;
  readonly widgetValues?: Record<string, number> | undefined;
}

/** A widget players see, with the GM's id it is known by in the companion only, and a running timer's run. */
export interface ListedWidget {
  readonly id: string;
  readonly widget: SharedWidget;
  /** A running timer had `remaining` seconds left at `since` (the GM's epoch ms); its message says how long ago. */
  readonly run?: TimerRun;
}

/** The bar players see: its scale and widgets, in order. */
export interface ListedBar {
  readonly scale: number;
  readonly widgets: readonly ListedWidget[];
}

/** A counter's or clock's value as Atlas's bar reads it: the scene's stepped value, else the definition's own. */
const steppedValue = (widget: AnyWidget, inputs: WidgetInputs): unknown => inputs.widgetValues?.[widget.id] ?? widget.value;

const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(-1e9, Math.min(1e9, value)) : 0);

/** A running timer's run as Atlas reads it, if its numbers are ones a message may carry. */
function sharedRun(widget: TimerWidget): TimerRun | undefined {
  const run = timerRun(widget);
  return run && run.remaining >= 0 && run.remaining === finite(run.remaining) ? run : undefined;
}

/** Seconds to the millisecond, as Atlas keeps them. */
const toMilliseconds = (seconds: number): number => Math.round(seconds * 1000) / 1000;

function sharedWidget(widget: AnyWidget, inputs: WidgetInputs): SharedWidget | null {
  const base = { label: String(widget.label ?? '').slice(0, MAX_NAME), icon: resolveWidgetIcon(widget.icon), colour: hexColour(widget.color) };
  if (widget.type === 'timer') {
    // A standing timer shows its whole seconds as Atlas's bar does; a running one's run is in its message.
    const run = sharedRun(widget);
    return { kind: 'timer', ...base, value: run ? toMilliseconds(run.remaining) : Math.max(0, Math.ceil(toMilliseconds(finite(widget.value)))) };
  }
  if (widget.type === 'clock') {
    if (!isValidClockSegments(widget.segments)) return null;
    return { kind: 'clock', ...base, value: finite(steppedValue(widget, inputs)), segments: widget.segments, showCount: widget.showCount === true };
  }
  return widget.type === 'counter' ? { kind: 'counter', ...base, value: finite(steppedValue(widget, inputs)) } : null;
}

/**
 * The widgets Atlas's player window shows (`PlayerWidgetBar`): none while the player view hides widgets
 * (`showWidgets`) or the scene hides its bar; otherwise those on in the scene and visible to players, in
 * their order. Only what the bar draws is kept: never a widget's id, range, duration or scope.
 */
export function listedWidgets(inputs: WidgetInputs, shown: boolean): ListedBar | null {
  const settings = inputs.widgetSettings;
  if (!shown || settings?.globalVisible !== true) return null;
  const widgets = Object.values(settings.widgets ?? {})
    .filter((widget) => isWidgetOn(settings, widget) && widget.visibleToPlayers === true)
    .sort((a, b) => a.order - b.order)
    .flatMap((widget) => {
      const shared = sharedWidget(widget, inputs);
      if (shared === null) return [];
      const run = widget.type === 'timer' ? sharedRun(widget) : undefined;
      return [run ? { id: widget.id, widget: shared, run } : { id: widget.id, widget: shared }];
    })
    .slice(0, MAX_WIDGETS);
  const scale = finite(settings.scale);
  return widgets.length === 0 ? null : { scale: scale >= 0.25 && scale <= 4 ? scale : 1, widgets };
}
