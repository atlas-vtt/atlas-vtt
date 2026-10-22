import type { ActiveCondition } from '../../../utils/activeConditions';
import { isLightBadgeColor } from '../../../utils/conditionGlyph';
import { WIDGET_ICON_PATHS, WIDGET_ICON_VIEW_BOX } from '../../../types/widgetIcons';
import { badgeColour } from './conditionBadgeColour';
import './condition-badge.scss';

/** `ConditionBadge` for panels built with the DOM instead of React: the same elements and classes. */
export function createConditionBadge(parent: HTMLElement, condition: Pick<ActiveCondition, 'color' | 'glyph' | 'value'>, size: number): HTMLElement {
  const badge = parent.createSpan({ cls: 'atlas-condition-badge', attr: { 'aria-hidden': 'true' } });
  if (isLightBadgeColor(condition.color)) badge.addClass('atlas-condition-badge--light');
  badge.style.setProperty('--atlas-condition-color', badgeColour(condition.color));
  badge.style.setProperty('--atlas-condition-size', `${size}px`);
  const { glyph } = condition;
  if (glyph.kind === 'icon') {
    const svg = badge.createSvg('svg', { attr: { viewBox: WIDGET_ICON_VIEW_BOX, fill: 'currentColor', 'aria-hidden': 'true' } });
    svg.createSvg('path', { attr: { d: WIDGET_ICON_PATHS[glyph.icon] } });
  } else {
    badge.appendText(glyph.text);
  }
  if (condition.value !== undefined) badge.createSpan({ cls: 'atlas-condition-badge__value', text: String(condition.value) });
  return badge;
}
