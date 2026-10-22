import React from 'react';
import type { ActiveCondition } from '../../../utils/activeConditions';
import { isLightBadgeColor } from '../../../utils/conditionGlyph';
import { WidgetIconGlyph } from '../../../react/components/WidgetIconGlyph';
import { badgeColour } from './conditionBadgeColour';
import './condition-badge.scss';

interface ConditionBadgeProps {
  condition: Pick<ActiveCondition, 'color' | 'glyph' | 'value'>;
  /** Diameter in CSS pixels. */
  size: number;
}

/**
 * A condition's badge as tokens show it on the map: its glyph on a disc of its colour, a valued
 * condition's number in a pip. `createConditionBadge` is its twin for panels built with the DOM.
 */
export function ConditionBadge({ condition, size }: ConditionBadgeProps): React.ReactElement {
  const style = { '--atlas-condition-color': badgeColour(condition.color), '--atlas-condition-size': `${size}px` } as React.CSSProperties;
  return (
    <span className={`atlas-condition-badge${isLightBadgeColor(condition.color) ? ' atlas-condition-badge--light' : ''}`} style={style} aria-hidden="true">
      {condition.glyph.kind === 'icon' ? <WidgetIconGlyph icon={condition.glyph.icon} size={Math.round(size * 0.62)} /> : condition.glyph.text}
      {condition.value !== undefined && <span className="atlas-condition-badge__value">{condition.value}</span>}
    </span>
  );
}
