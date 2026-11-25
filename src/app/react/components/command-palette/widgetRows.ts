import type { AnyWidget } from '../../../types/widgetTypes';
import type { WidgetRecord } from '../../../utils/collectionWidgets';

export interface WidgetRow {
  widget: AnyWidget;
  /** Whether the scene holds the widget (it may still be switched off there). */
  inScene: boolean;
  /** Whether the widget is switched on in this scene. */
  active: boolean;
}

/**
 * The scene's widgets and the rest of its collection's, which the scene has
 * never switched on, in their order.
 */
export function widgetRows(
  sceneWidgets: readonly AnyWidget[],
  isOn: (widget: AnyWidget) => boolean,
  library: WidgetRecord,
): WidgetRow[] {
  const sceneIds = new Set(sceneWidgets.map((widget) => widget.id));
  const elsewhere = Object.values(library).filter((widget) => !sceneIds.has(widget.id));
  return [
    ...sceneWidgets.map((widget) => ({ widget, inScene: true, active: isOn(widget) })),
    ...elsewhere.map((widget) => ({ widget, inScene: false, active: false })),
  ].sort((a, b) => a.widget.order - b.widget.order);
}

/** The rows in the order `ids` gives; rows it does not name follow in their own order. */
export function rowsInOrder(rows: readonly WidgetRow[], ids: readonly string[]): WidgetRow[] {
  const place = new Map(ids.map((id, index) => [id, index]));
  const rank = (row: WidgetRow): number => place.get(row.widget.id) ?? ids.length;
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/** `ids` with `id` moved `step` places, or null where that leaves the list. */
export function movedWidgetIds(ids: readonly string[], id: string, step: number): string[] | null {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** The library with every widget `ids` names placed at its index; the same record where nothing moves. */
export function withWidgetOrder(widgets: WidgetRecord, ids: readonly string[]): WidgetRecord {
  let next = widgets;
  ids.forEach((id, order) => {
    const widget = next[id];
    if (!widget || widget.order === order) return;
    next = { ...next, [id]: { ...widget, order } };
  });
  return next;
}
