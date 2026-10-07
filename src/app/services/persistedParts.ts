import { persistableDiceLog } from '../tools/diceRolling';
import type { DiceRollResult } from '../types/diceTypes';
import type { WidgetSettings } from '../types/widgetTypes';
import { withoutCollectionWidgets, type WidgetValues } from '../utils/collectionWidgets';

/** The parts of a map file that the store's save derives from its state, rather than saving as they are. */
export interface PersistedParts {
  diceLog(log: readonly DiceRollResult[]): DiceRollResult[];
  widgets(settings: WidgetSettings, values: WidgetValues): { widgetSettings: WidgetSettings; widgetValues: WidgetValues };
}

const sameEntries = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((entry, i) => entry === b[i]);

/**
 * Keeps each derived part by identity while what it is derived from is unchanged, so the store's save can tell by
 * reference that nothing it writes changed (`persistedSliceChanged` in storeFactory) and a selection change, a roll
 * that stays in memory or any other unsaved change never rewrites the map file.
 */
export function createPersistedParts(): PersistedParts {
  let log: { input: readonly DiceRollResult[]; output: DiceRollResult[] } | null = null;
  let widgets: { settings: WidgetSettings; values: WidgetValues; output: ReturnType<PersistedParts['widgets']> } | null = null;
  return {
    diceLog(input) {
      if (log?.input === input) return log.output;
      const output = persistableDiceLog(input);
      log = { input, output: log && sameEntries(log.output, output) ? log.output : output };
      return log.output;
    },
    widgets(settings, values) {
      if (widgets?.settings === settings && widgets.values === values) return widgets.output;
      const scene = withoutCollectionWidgets({ widgets: settings.widgets, widgetValues: values });
      widgets = { settings, values, output: { widgetSettings: { ...settings, widgets: scene.widgets }, widgetValues: scene.widgetValues } };
      return widgets.output;
    },
  };
}
