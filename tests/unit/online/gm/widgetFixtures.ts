import type { AnyWidget, ClockWidget, CounterWidget, TimerWidget, WidgetSettings } from '../../../../src/app/types/widgetTypes';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { sceneState } from './shareHarness.ts';

/** A scene with widget settings and stepped values, as Atlas's store holds them. */
export type WidgetSceneState = SceneState & { widgetSettings?: WidgetSettings; widgetValues?: Record<string, number> };

export const counter = (id: string, changes: Partial<CounterWidget> = {}): CounterWidget => ({
  id, type: 'counter', label: `Counter ${id}`, icon: 'heart', visible: true, visibleToPlayers: true, value: 3, order: 0, min: 0, max: 20, ...changes,
});

export const clock = (id: string, changes: Partial<ClockWidget> = {}): ClockWidget => ({
  id, type: 'clock', label: `Clock ${id}`, icon: 'hourglass', visible: true, visibleToPlayers: true, value: 2, order: 1, segments: 6, showCount: true, color: '#E5484D', ...changes,
});

export const timer = (id: string, changes: Partial<TimerWidget> = {}): TimerWidget => ({
  id, type: 'timer', label: `Timer ${id}`, icon: 'flame', visible: true, visibleToPlayers: true, value: 60, order: 2, duration: 60, direction: 'down', scope: 'collection', ...changes,
});

/** A scene holding `widgets`, its bar shown, with `values` for its counters and clocks. */
export function widgetScene(widgets: readonly AnyWidget[], changes: Partial<WidgetSettings> = {}, values: Record<string, number> = {}): WidgetSceneState {
  return {
    ...sceneState(),
    widgetSettings: { widgets: Object.fromEntries(widgets.map((widget) => [widget.id, widget])), globalVisible: true, position: 'top', scale: 1, ...changes },
    widgetValues: values,
  };
}
