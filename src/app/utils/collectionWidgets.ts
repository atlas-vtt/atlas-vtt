import { shallow } from 'zustand/vanilla/shallow';
import type { AnyWidget, WidgetSettings } from '../types/widgetTypes';
import { isSteppedWidget } from './counterWidget';

export type WidgetRecord = WidgetSettings['widgets'];
export type WidgetValues = Record<string, number>;

/** The widget slice of a scene: definitions plus the undo-tracked values. */
export interface SceneWidgets {
  widgets: WidgetRecord;
  widgetValues: WidgetValues;
}

export function isCollectionWidget(widget: AnyWidget): boolean {
  return widget.scope === 'collection';
}

/** Counters and clocks keep their current value in the undo-tracked `widgetValues`, timers on the definition. */
function currentValue(widget: AnyWidget, widgetValues: WidgetValues): number {
  return isSteppedWidget(widget) ? widgetValues[widget.id] ?? widget.value : widget.value;
}

/** The value a widget starts at in a scene that switches it on: timers full, counters and clocks at 0. */
export function initialWidgetValue(widget: AnyWidget): number {
  return widget.type === 'timer' ? widget.duration : 0;
}

/**
 * The scene's widgets as the collection's library stores them. Widgets on in
 * every scene carry their shared current value (and a timer's run); the others
 * only their definition, with the value a scene starts them at and never running,
 * since each scene counts on its own.
 */
export function pickLibraryWidgets({ widgets, widgetValues }: SceneWidgets): WidgetRecord {
  const library: WidgetRecord = {};
  for (const widget of Object.values(widgets)) {
    if (isCollectionWidget(widget)) {
      const value = currentValue(widget, widgetValues);
      library[widget.id] = widget.value === value ? widget : { ...widget, value };
    } else {
      library[widget.id] = withSceneTime(widget, { value: initialWidgetValue(widget) });
    }
  }
  return library;
}

/**
 * The widget with a scene's own value, and for a timer whether and since when it
 * runs in that scene; returns `widget` when nothing differs.
 */
function withSceneTime(widget: AnyWidget, own: AnyWidget | { value: number }): AnyWidget {
  if (widget.type !== 'timer') return widget.value === own.value ? widget : { ...widget, value: own.value };
  const running = 'type' in own && own.type === 'timer' ? own.running : undefined;
  if (widget.value === own.value && widget.running === running) return widget;
  const timer = { ...widget, value: own.value };
  if (running) timer.running = running;
  else delete timer.running;
  return timer;
}

/**
 * Applies the collection's library to a scene: widgets on in every scene come in
 * with their shared value, and the scene's other widgets take the library's
 * definition while keeping their own value. Widgets the library lacks stay.
 */
export function withCollectionWidgets(scene: SceneWidgets, library: WidgetRecord): SceneWidgets {
  const { widgets, widgetValues } = withoutCollectionWidgets(scene);
  const merged: SceneWidgets = { widgets: { ...widgets }, widgetValues: { ...widgetValues } };
  for (const widget of Object.values(library)) {
    const own = merged.widgets[widget.id];
    if (isCollectionWidget(widget)) {
      merged.widgets[widget.id] = widget;
      if (isSteppedWidget(widget)) merged.widgetValues[widget.id] = widget.value;
    } else if (own) {
      const refreshed = withSceneTime(widget, own);
      if (!shallow(own, refreshed)) merged.widgets[widget.id] = refreshed;
    }
  }
  return merged;
}

/**
 * Applies a scene's edit to the collection's library: only widgets the scene
 * added or changed since `before` (what it was last shown) change. Removing a
 * widget from a scene only switches it off there; deleting it from the library
 * is explicit (`withoutWidget`), so a scene that lacks a widget never deletes it.
 */
export function withCollectionEdit(collection: WidgetRecord, before: WidgetRecord, after: WidgetRecord): WidgetRecord {
  const result = { ...collection };
  for (const widget of Object.values(after)) {
    const previous = before[widget.id];
    if (!previous || !shallow(previous, widget)) result[widget.id] = widget;
  }
  return result;
}

/** The record without the widget `id`. */
export function withoutWidget(widgets: WidgetRecord, id: string): WidgetRecord {
  const rest = { ...widgets };
  delete rest[id];
  return rest;
}

/**
 * The widgets that belong to the scene file. Collection-wide widgets live in the
 * collection settings, so scene files never hold stale copies of them.
 */
export function withoutCollectionWidgets(scene: SceneWidgets): SceneWidgets {
  const sharedIds = Object.values(scene.widgets).filter(isCollectionWidget).map((widget) => widget.id);
  if (sharedIds.length === 0) return scene;

  const widgets = { ...scene.widgets };
  const widgetValues = { ...scene.widgetValues };
  for (const id of sharedIds) {
    delete widgets[id];
    delete widgetValues[id];
  }
  return { widgets, widgetValues };
}

/** True when both records hold the same widgets with the same fields. */
export function sameWidgets(a: WidgetRecord, b: WidgetRecord): boolean {
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  return ids.every((id) => {
    const other = b[id];
    return other !== undefined && shallow(a[id], other);
  });
}
