import type { WidgetSettings } from '../types/widgetTypes';
import { withoutCollectionWidgets, type WidgetValues } from '../utils/collectionWidgets';

/** The parts of a map file that the store's save derives from its state, rather than saving as they are. */
export interface PersistedParts {
  widgets(settings: WidgetSettings, values: WidgetValues): { widgetSettings: WidgetSettings; widgetValues: WidgetValues };
}

/**
 * Keeps each derived part by identity while what it is derived from is unchanged, so the store's save can tell by
 * reference that nothing it writes changed (`persistedSliceChanged` in storeFactory) and a selection change or any
 * other unsaved change never rewrites the map file.
 */
export function createPersistedParts(): PersistedParts {
  let widgets: { settings: WidgetSettings; values: WidgetValues; output: ReturnType<PersistedParts['widgets']> } | null = null;
  return {
    widgets(settings, values) {
      if (widgets?.settings === settings && widgets.values === values) return widgets.output;
      const scene = withoutCollectionWidgets({ widgets: settings.widgets, widgetValues: values });
      widgets = { settings, values, output: { widgetSettings: { ...settings, widgets: scene.widgets }, widgetValues: scene.widgetValues } };
      return widgets.output;
    },
  };
}
