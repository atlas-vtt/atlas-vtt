import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { isWidgetIcon, type WidgetIcon } from '../types/widgetIcons';

/** What a condition badge shows: its icon, or the condition's initial while it has none. */
export type ConditionGlyph = { kind: 'icon'; icon: WidgetIcon } | { kind: 'text'; text: string };

export function conditionGlyph(condition: Pick<ConditionDefinition, 'name' | 'icon'>): ConditionGlyph {
  if (isWidgetIcon(condition.icon)) return { kind: 'icon', icon: condition.icon };
  const initial = Array.from(condition.name.trim())[0];
  return { kind: 'text', text: initial ? initial.toLocaleUpperCase() : '?' };
}

/** Whether `color` (0xRRGGBB) is light enough that a dark glyph reads better on it than a white one. */
export function isLightBadgeColor(color: number): boolean {
  const channel = (shift: number): number => {
    const value = ((color >> shift) & 0xff) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.45;
}
