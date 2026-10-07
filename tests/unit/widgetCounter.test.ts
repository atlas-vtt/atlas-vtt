import { describe, expect, it } from 'vitest';
import { isWidgetIcon, resolveWidgetIcon, DEFAULT_WIDGET_ICON } from '../../src/app/types/widgetIcons';
import { conditionGlyph } from '../../src/app/utils/conditionGlyph';
import { clampCounterValue, readCounterValue } from '../../src/app/utils/counterWidget';
import type { CounterWidget } from '../../src/app/types/widgetTypes';

const counter: CounterWidget = {
  id: 'fear', type: 'counter', label: 'Fear', icon: 'skull',
  visible: true, visibleToPlayers: true, value: 4, order: 0,
};

describe('widget icons', () => {
  it('keeps known icons and maps legacy or unknown names', () => {
    expect(resolveWidgetIcon('skull')).toBe('skull');
    expect(resolveWidgetIcon('timer')).toBe('hourglass');
    expect(resolveWidgetIcon('nope')).toBe(DEFAULT_WIDGET_ICON);
    expect(resolveWidgetIcon(undefined)).toBe(DEFAULT_WIDGET_ICON);
  });

  it('never takes a name from the object prototype for an icon', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(resolveWidgetIcon(name)).toBe(DEFAULT_WIDGET_ICON);
      expect(isWidgetIcon(name)).toBe(false);
      expect(conditionGlyph({ name: 'Poisoned', icon: name as never })).toEqual({ kind: 'text', text: 'P' });
    }
    expect(isWidgetIcon('skull')).toBe(true);
  });
});

describe('counter values', () => {
  it('prefers widgetValues, falling back to the legacy definition value', () => {
    expect(readCounterValue({ widgetValues: { fear: 7 } }, counter)).toBe(7);
    expect(readCounterValue({ widgetValues: {} }, counter)).toBe(4);
  });

  it('clamps to the default and configured range', () => {
    expect(clampCounterValue(counter, -1)).toBe(0);
    expect(clampCounterValue(counter, 120)).toBe(99);
    expect(clampCounterValue({ ...counter, min: -5, max: 5 }, -9)).toBe(-5);
  });
});
